import { Page, expect } from "@playwright/test";
import { EventsPage } from "../pages/EventsPage.js";
import { BasePage } from "../pages/BasePage.js";
import { VendorPortalPage } from "../pages/VendorPortalPage.js";
import { recordStuck } from "../oracle/stuck.js";
import { CounterOfferPage } from "../pages/CounterOfferPage.js";
import { SurrogateBidPage } from "../pages/SurrogateBidPage.js";
import { AwardPage } from "../pages/AwardPage.js";
import { vendorNames, vendorCount } from "../master/params.js";
import { CreateEventPage, ProductInput, StageKey } from "../pages/CreateEventPage.js";
import { EventDetailPage } from "../pages/EventDetailPage.js";
import { SingleStagePage } from "../pages/SingleStagePage.js";
import { generateEventTitle } from "../helpers/data.js";
import { buildProducts } from "../master/params.js";
import { WidgetConfig } from "../helpers/inlineSheet.js";
import { PlanStep, TestPlan } from "./steps.js";
import { runGenericStep } from "./generic/run.js";
import { toastMark } from "./generic/messages.js";
import type { Target } from "./generic/find.js";
import { qaVendorNames, qaVendorLogins, vendorLogins, isQaVendorName, allowRealVendors } from "../db/qaVendors.js";
import { runExpectationStep } from "./expectations.js";
import { installObserver, observe, type Observation } from "./observe.js";
import { resolveScreen, type PlanContext } from "./screens.js";
import { CONFIG, NAV } from "../config.js";
import { focusFrames } from "../support/liveCursor.js";
import { askTester, SAYS_STOP } from "../explore/ask.js";
import { failedVendorEmails, learnVendorLogin, learnedVendorLogins } from "../support/learnedStore.js";
import { lookUpVendor, vendorNameForEmail } from "../support/vendorDirectory.js";
import { controlHeld, handedBackAt, released } from "../support/liveControl.js";
import { needOf, roundNow, cannotTakeBid, takesBid } from "../db/pickEvent.js";

/** The QA vendors invite_vendor put on this run's event (one plan per process). */
/** The vendors on the event, as invite_vendor last saw them — who a bid step may sign in as. */
let invitedVendors: string[] = [];
/** Who has already bid from the vendor portal in this plan — the next bid picks someone else. */
let biddersUsed: string[] = [];
const QA_EMAIL = /^qa_[a-z0-9_.-]+@example\.(com|org|net)$/i;

/**
 * Who the vendor portal is signed in as: a vendor that is ON the event.
 *
 * The names come from the event's participant chips (invite_vendor records
 * them) and are matched to this client's vendors that have a login, in the
 * database. The profile's own vendor is preferred when it is among them.
 * With SPINE_QA_VENDORS_ONLY=1 it is the client's QA test vendor instead.
 */
async function bidderEmail(want?: unknown): Promise<string> {
  const used = (e: string) => biddersUsed.some((u) => u.toLowerCase() === e.toLowerCase());
  // The vendors this run may sign in as, in a fixed order: the profile's own
  // vendor first (as before), then the rest of the event's vendors with a login.
  let pool: Array<{ name: string; email: string }>;
  if (!allowRealVendors()) {
    const qa = await qaVendorLogins();
    const invited = qa.filter((v) => invitedVendors.some((n) => isQaVendorName(n, [v.name])));
    pool = invited.length ? invited : qa.slice(0, 1);
    if (!pool.length) throw new Error("this client has no QA test vendor to sign in as on the vendor portal; create one, or leave SPINE_QA_VENDORS_ONLY unset to bid as a vendor on the event");
  } else if (!invitedVendors.length) {
    // No invite step recorded who is on the event: the profile's vendor, as before.
    pool = [{ name: "the profile's vendor", email: CONFIG.vendorEmail }];
  } else {
    // The client's vendors with a login (the database), plus logins earlier runs
    // learned (the Vendors module, or the tester) — minus ones that failed before.
    const cid = Number(process.env.COMPANY_ID) || null;
    const failed = failedVendorEmails(cid);
    const known = [...(await vendorLogins()), ...learnedVendorLogins(cid).map((v) => ({ name: v.name, email: v.email }))];
    const logins = known.filter((v, i) => !failed.has(v.email.toLowerCase()) && known.findIndex((x) => x.email.toLowerCase() === v.email.toLowerCase()) === i);
    const onEvent = logins.filter((v) => invitedVendors.some((n) => isQaVendorName(n, [v.name])));
    const own = onEvent.filter((v) => v.email.toLowerCase() === CONFIG.vendorEmail.toLowerCase());
    pool = [...own, ...onEvent.filter((v) => !own.includes(v))];
    if (!pool.length) {
      throw new Error(
        `none of the vendors on the event (${invitedVendors.slice(0, 5).join(", ")}${invitedVendors.length > 5 ? ", …" : ""}) ` +
          "has a user this run can sign in to the vendor portal as",
      );
    }
  }
  const who = (p: typeof pool) => p.map((v) => v.name).slice(0, 5).join(", ");
  // vendor: 2 — the second vendor of the pool; vendor: "<name>" — that vendor.
  if (typeof want === "number" || /^\d+$/.test(String(want ?? ""))) {
    const n = Number(want);
    const pick = pool[n - 1];
    if (!pick) throw new Error(`a bid as vendor ${n} needs ${n} vendors on the event that can sign in to the vendor portal — there ${pool.length === 1 ? "is 1" : `are ${pool.length}`} (${who(pool)})`);
    return pick.email;
  }
  if (want) {
    const pick = pool.find((v) => isQaVendorName(String(want), [v.name]) || v.name.toLowerCase().includes(String(want).toLowerCase()));
    if (!pick) throw new Error(`${String(want)} is not among the vendors on the event that can sign in to the vendor portal (${who(pool)})`);
    return pick.email;
  }
  // No vendor named: the next one that has not bid yet, so two bid steps are two vendors.
  const pick = pool.find((v) => !used(v.email));
  if (!pick) {
    throw new Error(
      `a bid from another vendor needs one more vendor on the event that can sign in to the vendor portal — ` +
        `${pool.length === 1 ? "the only one" : `all ${pool.length}`} (${who(pool)}) already bid in this run` +
        (allowRealVendors() ? "" : ". This run uses QA test vendors only (SPINE_QA_VENDORS_ONLY=1), so it does not sign in as a real vendor"),
    );
  }
  return pick.email;
}

/** bidderEmail ran out: no vendor on the event this run can sign in as (yet). */
const NO_LOGIN = /needs one more vendor|has a user this run can sign in|needs \d+ vendors on the event/;

/**
 * Another vendor to bid as, when the ones this run knows have all bid.
 *
 * Aanya's order (15 Oct): ask the tester for a vendor's login; when they don't
 * know, look the event's vendor up in the Vendors module and use its email —
 * the vendor portal takes the inviting buyer's UAT login code. With nobody to
 * ask (a run not started from the dashboard) it looks up straight away.
 */
async function anotherVendor(s: RunState, why: string): Promise<{ email: string; name: string; source: string }> {
  const cid = Number(process.env.COMPANY_ID) || null;
  const failed = failedVendorEmails(cid);
  const tried = new Set(biddersUsed.map((e) => e.toLowerCase()));
  const fresh = (e: string) => !tried.has(e.toLowerCase()) && !failed.has(e.toLowerCase());
  const names = invitedVendors.filter((n) => n && !/^\+/.test(n.trim()));
  const a = await askTester({
    kind: "question",
    question: "I need another vendor to bid as, and I don't have a login for one. Which vendor should I sign in as?",
    detail:
      `${why.replace(/\.$/, "")}. The vendor portal takes the buyer's UAT login code, so a vendor's email is enough — type one, or let me look one up.` +
      (names.length ? ` Vendors on this event: ${names.slice(0, 4).join(", ")}.` : ""),
    options: [
      { id: "lookup", label: "Look it up in the Vendors module for me" },
      { id: "stop", label: "Stop here" },
    ],
  });
  if (a && (a.option === "stop" || (!a.option && SAYS_STOP.test(a.text)))) throw new Error("no other vendor to bid as, and you chose to stop here");
  const typed = a && !a.option ? a.text.trim() : "";
  const mail = typed.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/)?.[0];
  if (mail) {
    const name = (await vendorNameForEmail(s.page, mail).catch(() => null)) ?? mail;
    console.log(`[bid] signing in as the vendor you gave — ${mail}${name !== mail ? ` (${name})` : ""}`);
    return { email: mail, name, source: "tester" };
  }
  // "idk", "look it up", the option, or nobody to ask: look the event's vendors up.
  // A vendor name typed instead is looked up first.
  const dontKnow = !a || a.option === "lookup" || /\b(idk|i ?do ?n'?t know|not sure|no idea|look (?:it )?up|find (?:it|one)|you find)\b/i.test(typed);
  const lookFor = !dontKnow && typed ? [typed, ...names] : names;
  if (!a) console.log("[bid] nobody to ask (the run was not started from the dashboard) — looking a vendor up in the Vendors module");
  for (const n of lookFor) {
    const v = await lookUpVendor(s.page, n).catch(() => null);
    if (v && fresh(v.email)) return { email: v.email, name: n, source: "vendors-module" };
  }
  throw new Error(
    `no other vendor to bid as — ${lookFor.length ? `none of ${lookFor.slice(0, 4).join(", ")} is in the Vendors module with an email this run has not already used` : "the event shows no other vendor's name to look up"}`,
  );
}

/** "AMD is a real supplier, so …" — said when a named real supplier was swapped for the client's QA vendors. */
const swapNote = (real: string[]) =>
  real.length ? `${real.join(", ")} ${real.length === 1 ? "is a real supplier" : "are real suppliers"}, so the client's QA test vendor was invited instead — ` : "";

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
  /** done by the tester in the browser (take control), not by the run: never counted as tested */
  byHand?: boolean;
  /** For generic steps: which locator strategy found the element (role+name, label, text, healer…). */
  strategy?: string;
  ms: number;
}

export interface PlanResult {
  title: string;
  steps: StepResult[];
  passed: boolean;
  /** how many steps the tester did by hand — the run is then only partly tested, never passed */
  byHand?: number;
  /** The observation pass: what the runner saw on each screen it visited (observe.ts). */
  observations?: Observation[];
}

interface RunState {
  /** set by runStep when the tester had already done this step in the browser */
  didByHand?: boolean;
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
  /** The steps still to come — what an event picked for open_event must be ready for. */
  later?: string[];
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

/**
 * Can the event on screen take what the case does next? A surrogate bid
 * needs a vendor on its pricing round offered Add Bid; Master QCS, awarding
 * and counter offers need bids in. Anything else: an open event will do.
 */
const bidsNext = (later: string[]) => later.some((x) => /^(place_surrogate_bid|open_participants)$/.test(x));

async function fitsCase(s: RunState, later: string[], title?: string): Promise<{ ok: boolean; why: string }> {
  if (bidsNext(later)) return new SurrogateBidPage(s.page).canAddBid(title);
  if (later.some((x) => /^(open_master_qcs|start_awarding|allocate_award|award_event|expect_award|place_counter_offer|expect_counter_offer)/.test(x))) {
    await new AwardPage(s.page).openMasterQcs().catch(() => false);
    const none = await s.page.getByText(/no bids (are|have been) placed/i).first().waitFor({ state: "visible", timeout: 6_000 }).then(() => true).catch(() => false);
    return none ? { ok: false, why: "its Master QCS says no bids are placed yet" } : { ok: true, why: "its Master QCS has bids to compare" };
  }
  return { ok: true, why: "it is open" };
}

/**
 * No event on the Live list fits the case: ask the tester (the session's
 * question card) — create one for it, pick one in the browser, name one, or
 * stop. Without anyone to ask (a run not started from the dashboard), stop
 * and say why.
 */
async function noFittingEvent(s: RunState, need: "bids" | "live", later: string[], passed: string[]): Promise<string> {
  const surrogate = later.includes("place_surrogate_bid");
  const wants =
    need === "bids"
      ? "a live event with bids in"
      : surrogate
        ? "a live event whose RFQ round is open for a few minutes more, with an invited vendor who has not bid yet"
        : "a live event whose RFQ round is open for quotes";
  const answer = await askTester({
    kind: "stuck",
    question: `No live event fits this case — it needs ${wants}. What should I do?`,
    detail: passed.length ? `Passed over — ${passed.join("; ")}.` : "The Live events list showed none that fit.",
    options: [
      // Publishing invites the event's vendors, and each invited vendor gets an email: say so before the click.
      { id: "create", label: `Create and publish a new event for this case, then carry on${need === "bids" ? " (it gets a bid and its bidding closes first)" : ""} — publishing emails the vendors it invites` },
      { id: "self", label: "I'll open one myself in the browser" },
      { id: "stop", label: "Stop here" },
    ],
  });
  if (!answer) throw new Error(`no live event fits this case — it needs ${wants}.${passed.length ? ` Passed over — ${passed.join("; ")}.` : ""}`);
  if (answer.option === "stop") throw new Error(`no live event fits this case — it needs ${wants} — and you chose to stop here.${passed.length ? ` Passed over — ${passed.join("; ")}.` : ""}`);
  if (answer.option === "self") {
    // Take control (session card → spineLiveControl.take()); carry on from the page handed back.
    for (let t = 0; t < 40 && !controlHeld(); t++) await new Promise((r) => setTimeout(r, 200));
    await released();
    if (!/\/project\//.test(s.page.url())) throw new Error("the browser was handed back without an event open — open the event's page, then hand back");
    s.title = (await s.page.locator("h1, h2, [class*='title' i]").first().textContent().catch(() => ""))?.trim() || s.title;
    return `you opened the event yourself in the browser (${new URL(s.page.url()).pathname})`;
  }
  if (answer.option === "create") return createEventForCase(s, need);
  // A typed reply: the event to use, by its title.
  const title = answer.text.trim();
  const where = await s.events.openEvent({ title });
  s.title = title;
  return `opened “${title}”, the event you named, at ${where}`;
}

/** A fresh RFQ for the case, built with the plan's own steps — with a bid in and bidding closed when the case needs bids. */
async function createEventForCase(s: RunState, need: "bids" | "live"): Promise<string> {
  const steps: PlanStep[] = [
    { step: "open_create", args: { path: "erfx" } },
    { step: "set_title" },
    { step: "compose_stages", args: { stages: ["rfq"] } },
    { step: "select_template" },
    { step: "add_line_items", args: { count: 1 } },
    { step: "fill_sheet" },
    { step: "set_schedule", args: need === "bids" ? { minutes: 3 } : {} },
    { step: "invite_vendor", args: { count: 1 } },
    { step: "publish" },
    { step: "expect_published" },
    ...(need === "bids" ? ([{ step: "place_surrogate_bid" }, { step: "close_event" }] as PlanStep[]) : []),
  ];
  for (const [k, st] of steps.entries()) {
    const detail = await runStep(s, st);
    console.log(`[plan] creating an event for this case ${k + 1}/${steps.length} ${st.step} ✓ ${detail ?? ""}`);
  }
  return `no live event fitted, so (as you chose) the run created “${s.title}”${need === "bids" ? ", placed a bid on it and let its bidding close" : ""}`;
}

/** Steps that drive the create screen — nothing to do once the event is published. */
const CREATE_SCREEN_STEP = /^(compose_stages|expect_stages|set_title|select_template|add_line_items|expect_line_items|fill_sheet|set_schedule|invite_vendor|publish|save_draft|configure_single_stage)$/;

async function runStep(s: RunState, step: PlanStep): Promise<string | undefined> {
  const a = step.args ?? {};
  // The tester took the browser and published the event themselves: the page
  // handed back is the event's project, and a create-screen step driven
  // against it only waits and fails (a run stuck after "I published it myself").
  if (handedBackAt() && CREATE_SCREEN_STEP.test(step.step)) {
    const id = s.page.url().match(/\/project\/([^/?#]+)/)?.[1];
    if (id) {
      s.projectId = s.projectId ?? id;
      s.didByHand = true;
      return `the event is already published (project ${id})`;
    }
  }
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
      // No event named, and this plan built none: pick one from the Live list
      // the way a tester would — the event the later steps need (quotes waiting
      // to be evaluated for Master QCS / awarding / counter offers; an RFQ open
      // for quotes otherwise) — and click it there. No search, and no event
      // fixed in advance: fetching one particular event by name (picked from the
      // database) failed whenever the list did not show it.
      // Each pick is then checked on the event itself (can it take what the
      // case does next?); one that cannot is passed over for the next card,
      // and when none fits the tester is asked — create one, pick one, or stop.
      if (!a.id && !a.title && !s.projectId) {
        const later = s.later ?? [];
        const need = needOf(later);
        const tried: string[] = [];
        const passed: string[] = [];
        // "[pick] ✓|✗|· …": each event looked at and why it was used or passed
        // over — shown under this step in the session (planNote), so a run that
        // finds nothing says what it tried.
        const skip = (title: string, why: string) => {
          passed.push(`“${title}”: ${why}`);
          console.log(`[pick] ✗ “${title}” — ${why}`);
        };
        // A bid needs its round open now: asked of the database before a card
        // is clicked, so an event the Live list still shows after bidding
        // closed is passed over without opening it.
        const vet = bidsNext(later)
          ? async (title: string) => {
              const r = await roundNow(title);
              if (!r) return null;
              const no = cannotTakeBid(r);
              return no ? { ok: false, why: no } : { ok: true, why: takesBid(r) };
            }
          : undefined;
        for (let attempt = 0; attempt < 4; attempt++) {
          let p: { title: string; why: string; where: string };
          try {
            p = await s.events.pickFromLive(need, tried, vet, skip);
          } catch (e) {
            const m = (e as Error).message.split("\n")[0];
            if (!/was passed over$/.test(m) || !passed.length) {
              passed.push(m);
              console.log(`[pick] · ${m}`);
            }
            break;
          }
          tried.push(p.title);
          console.log(`[pick] · opened “${p.title}” — ${p.why}`);
          const fit = await fitsCase(s, later, p.title);
          if (fit.ok) {
            s.title = p.title;
            console.log(`[pick] ✓ “${p.title}” — ${fit.why}`);
            const before = passed.length ? ` Passed over first — ${passed.join("; ")}.` : "";
            return `no event was named, so the run picked “${p.title}” from ${p.where} — ${p.why}; ${fit.why}.${before}`;
          }
          skip(p.title, fit.why);
        }
        return await noFittingEvent(s, need, later, passed);
      }
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
      // The live view follows the vendor into the portal, then comes back.
      const release = focusFrames(vendorPage);
      try {
        const portal = new VendorPortalPage(vendorPage);
        // Signed in as the client's QA test vendor, never a real supplier.
        const email = await bidderEmail();
        await portal.goto();
        const how = await portal.login(email);
        await portal.openEvent(s.title);
        const detail = await portal.acceptCounterOffer(s.title);
        s.counterOfferAccepted = true;
        return `${detail} (signed in as ${email} with ${how})`;
      } finally {
        release();
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
    case "capture_screen": {
      const label = String(a.label ?? "capture").replace(/[^a-z0-9_-]+/gi, "-").slice(0, 60) || "capture";
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
      // An event with no bids shows "No bids are placed yet!" instead of a grid: say that, at once.
      const empty = s.page.getByText(/no bids (are|have been) placed/i).first();
      const shown = await Promise.race([
        grid.waitFor({ state: "visible", timeout: 30_000 }).then(() => "grid"),
        empty.waitFor({ state: "visible", timeout: 30_000 }).then(() => "empty"),
      ]).catch(() => "neither");
      if (shown === "empty") throw new Error(`Master QCS says “${((await empty.textContent().catch(() => "")) || "No bids are placed yet!").trim()}” — this event has no bids to compare`);
      if (shown === "neither") throw new Error("Master QCS showed neither a comparison grid nor a message within 30 s");
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
      // Straight to the create screen by its address (the menu is the fallback):
      // reaching it is this step's job, the Create Event menu is not its subject.
      await s.events.startCreate(path === "single-stage" ? "single-stage" : path === "boq" ? "boq" : "erfx", { direct: true });
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
    case "fill_questionnaires":
      await s.create.fillVendorAssessment();
      return "RFI sections filled";
    case "assign_evaluator": {
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
      const chosen = s.create.scheduleMinutesChosen;
      if (a.minutes && chosen && chosen !== asInt(a.minutes, 30)) return `schedule saved — asked ${a.minutes} min, the app's smallest covering preset is ${chosen} min`;
      return a.minutes ? `schedule saved (${chosen ?? a.minutes} min)` : "schedule saved";
    }
    case "place_bid": {
      // The vendor bids for themselves, which means a SECOND browser context:
      // the buyer's session cannot be reused, and reusing it would quietly test
      // the buyer's view of the portal rather than the vendor's.
      const browser = s.page.context().browser();
      if (!browser) throw new Error("no browser available to open a vendor session");
      const vendorCtx = await browser.newContext();
      const vendorPage = await vendorCtx.newPage();
      // The live view follows the vendor into the portal, then comes back.
      const release = focusFrames(vendorPage);
      try {
        const portal = new VendorPortalPage(vendorPage);
        // A vendor on the event: the one named (vendor: "<name>" or vendor: 2),
        // else the next one that has not bid yet in this plan. When none is left,
        // ask the tester / look one up in the Vendors module (anotherVendor), and
        // remember what worked — and what did not — for the next run.
        const cid = Number(process.env.COMPANY_ID) || null;
        let email = "";
        let how = "";
        let found: { email: string; name: string; source: string } | null = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
          found = null;
          try {
            email = await bidderEmail(a.vendor);
          } catch (err) {
            if (!allowRealVendors() || !NO_LOGIN.test((err as Error).message)) throw err;
            found = await anotherVendor(s, (err as Error).message);
            email = found.email;
          }
          await portal.goto();
          try {
            how = await portal.login(email);
            break;
          } catch (err) {
            const why = (err as Error).message.split("\n")[0].slice(0, 160);
            learnVendorLogin(cid, { name: found?.name ?? email, email, source: found?.source ?? "database", ok: false, why });
            biddersUsed.push(email);
            console.log(`[bid] ${email} could not sign in to the vendor portal (${why}) — I'll remember that and try another vendor`);
            if (attempt === 3) throw err;
          }
        }
        biddersUsed.push(email);
        if (found) {
          learnVendorLogin(cid, { name: found.name, email, source: found.source, ok: true });
          console.log(`[bid] learned: ${found.name} signs in to the vendor portal as ${email} — the next run uses it without asking`);
        }
        await portal.openEvent(s.title);
        await portal.startBidding(s.title);
        const cells = await portal.fillBid(Number(a.price ?? 100));
        await portal.submitBid();
        const ok = await portal.bidSubmitted();
        s.bidSubmitted = ok;
        if (!ok) throw new Error("the vendor portal did not confirm the quote as submitted");
        if (portal.stage === "technical") {
          return `technical response submitted from the vendor portal as ${email}, signed in with ${how} — ${portal.lastFill}`;
        }
        if (portal.answeredTechnical) return `bid placed from the vendor portal as ${email}, signed in with ${how}: ${portal.lastFill}`;
        return `bid placed from the vendor portal as ${email}, signed in with ${how} (${cells} cell(s))`;
      } finally {
        release();
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
        const asked = Array.isArray(a.names) ? a.names.map(String) : a.vendor ? [String(a.vendor)] : [];
        // Only QA test vendors may be named (real suppliers are never invited):
        // a real one is swapped for the client's QA vendors, and the run says so.
        const qa = await qaVendorNames();
        const names = allowRealVendors() ? asked : asked.filter((n) => isQaVendorName(n, qa));
        const real = allowRealVendors() ? [] : asked.filter((n) => !isQaVendorName(n, qa));
        const added: string[] = [];
        for (const n of names) if (await s.single.addParticipant(n)) added.push(n);
        if (!added.length) await s.single.inviteVendor();
        invitedVendors = allowRealVendors() ? added : added.filter((n) => isQaVendorName(n, qa));
        return swapNote(real) + (added.length ? `invited ${added.join(", ")} (single-stage)` : "vendors invited (single-stage)");
      }
      const asked = Array.isArray(a.vendors) ? (a.vendors as unknown[]).map(String) : vendorNames();
      const min = a.count !== undefined ? Number(a.count) : vendorCount();
      // A real supplier named in the plan is swapped for the client's QA test
      // vendors (real suppliers are never invited): the run goes on, and says so.
      let names = asked;
      let real: string[] = [];
      if (!allowRealVendors() && asked.length) {
        const qa = await qaVendorNames();
        real = asked.filter((n) => !isQaVendorName(n, qa));
        names = asked.filter((n) => isQaVendorName(n, qa));
      }
      const invited = await s.create.inviteVendors({ names, count: min });
      if (s.create.leftCreateScreen()) {
        const id = s.page.url().match(/\/project\/([^/?#]+)/)?.[1];
        if (id) s.projectId = s.projectId ?? id;
        s.didByHand = true;
        return `you published the event yourself (project ${id ?? "?"}) while vendors were being added`;
      }
      const present = await s.create.participantNames();
      invitedVendors = present.length ? present : invited;
      // The chips show four names and "+193": the count reads the "+N" too.
      const total = (await s.create.participantCount()) || present.length;
      const shown = invited.length ? invited : present;
      return swapNote(real) + (shown.length ? `invited ${shown.join(", ")} (${total} total)` : `${total} participant(s)`);
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
  biddersUsed = [];
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
  installObserver(page, process.env.QA_RUN_ID ?? `plan-${Date.now().toString(36)}`);
  /** The observation pass after a step — bounded, and never the reason a step fails. */
  const look = async (i: number, name: string, force: boolean) => {
    const o = await Promise.race([
      observe(page, i + 1, name, { force }).catch(() => null),
      new Promise<null>((r) => setTimeout(() => r(null), 25_000)),
    ]);
    if (o && (o.findings.length || o.screenshot)) observations.push(o);
    if (o?.findings.length) console.log(`[observe] after ${name}: ${o.findings.map((f) => `${f.rule}: ${f.detail}`).join(" | ").slice(0, 300)}`);
  };
  let failed = false;
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
      s.later = plan.steps.slice(i + 1).map((x) => x.step);
      const detail = await runStep(s, step);
      // Done by the tester in the browser, not by the run: recorded as such and
      // never counted as tested — a run they finished by hand is partly tested.
      if (s.didByHand) {
        s.didByHand = false;
        results.push({ step: step.step, args: step.args, status: "skipped", byHand: true, detail: `done by you in the browser, not tested by the run — ${detail ?? ""}`.replace(/ — $/, ""), ms: Date.now() - started });
        console.log(`[plan] ${i + 1}/${plan.steps.length} ${step.step} ⊘ done by you in the browser, not tested by the run`);
        continue;
      }
      results.push({ step: step.step, args: step.args, status: "ok", detail, ...(s.lastStrategy ? { strategy: s.lastStrategy } : {}), ms: Date.now() - started });
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
      results.push({ step: step.step, args: step.args, status: "failed", detail, ms: Date.now() - started });
      console.log(`[plan] ${i + 1}/${plan.steps.length} ${step.step} ✗ ${detail}`);
      await look(i, step.step, true);
      failed = true;
    }
  }

  const byHand = results.filter((r) => r.byHand).length;
  return { title: plan.title, steps: results, passed: !failed, ...(byHand ? { byHand } : {}), observations };
}
