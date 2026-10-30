/**
 * EXTEND SUBMISSION TIME / EDIT EVALUATION TIME — the "Increase Event Time" window (event Settings menu),
 * client-dashboard views/orderDetails/increaseAuctionModal.jsx + orderDetails.jsx handleOkIncreaseTime:
 *   • options: the preset slots (radio), "Custom" (a number + Minutes / Hours / Days; Edit Evaluation Time adds
 *     "Increase by" / "Decrease by") and "Fixed" (a date-time picker, days before the current end and more than
 *     3 months ahead disabled);
 *   • refusals are the field's own help text: "New time cannot be less than the current time", "New time cannot be
 *     less than existing …", or a red field with no words (custom left empty / 0, a fixed time before the end);
 *   • the save is PATCH /trade/:id {increase_auction_time | extra_closing_time: epoch}: new end = current end ±
 *     the duration, or NOW + the duration when the end has already passed (bidding reopens).
 * The step reads the event's end before and after from the app's own reads of the event and checks the sum.
 */
import type { Page, Response } from "@playwright/test";

const UNIT: Record<string, number> = { m: 60, h: 3600, d: 86400 };
const clean = (t: string) => t.replace(/\s+/g, " ").trim();

/** The end (and extra closing time) in an order-details reply, as epoch seconds. */
function endsIn(j: any): { end?: number; extra?: number } {
  const num = (v: unknown): number | undefined => (typeof v === "number" && v > 1e9 ? (v > 1e12 ? Math.round(v / 1000) : v) : typeof v === "string" && /^\d{10,13}$/.test(v) ? num(Number(v)) : typeof v === "string" && /^\d{4}-\d\d-\d\dT/.test(v) ? Math.round(Date.parse(v) / 1000) : undefined);
  const seen = new Set<unknown>();
  const out: { end?: number; extra?: number } = {};
  const walk = (o: any, depth: number) => {
    if (!o || typeof o !== "object" || seen.has(o) || depth > 4) return;
    seen.add(o);
    for (const [k, v] of Object.entries(o)) {
      if (out.end === undefined && /^(bid_end_time|end_time|ending_at|end)$/.test(k)) out.end = num(v);
      if (out.extra === undefined && /^(extra_closing_time|extra_time)$/.test(k)) out.extra = num(v);
      if (v && typeof v === "object") walk(v, depth + 1);
    }
  };
  walk(j, 0);
  return out;
}
// the event as the screen reads it: GET /v1/trade/:id/schema?…additional_fields=order_details (redux/orders/api.js
// getOrderDetails), or the older GET /trade/:id?additional_fields=…
const isOrderRead = (r: Response) => {
  if (r.request().method() !== "GET") return false;
  const u = new URL(r.url());
  return (/\/trade\/[A-Za-z0-9_-]+\/schema$/.test(u.pathname) && /order_details/.test(u.search)) || /\/trade\/[A-Za-z0-9_-]+$/.test(u.pathname);
};

/** Reload the screen and read the event's end from the app's own read of it (the first read that carries one). */
async function readEnd(page: Page): Promise<{ end?: number; extra?: number }> {
  let found: { end?: number; extra?: number } = {};
  const onResp = async (r: Response) => {
    if (found.end !== undefined || !isOrderRead(r) || r.status() >= 400) return;
    const got = await r.json().then(endsIn).catch(() => ({}) as { end?: number; extra?: number });
    if (got.end !== undefined && found.end === undefined) found = got;
  };
  page.on("response", onResp);
  await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
  for (let i = 0; i < 60 && found.end === undefined; i++) await page.waitForTimeout(500);
  page.off("response", onResp);
  return found;
}

/** A server time as the screen shows it (moved by timeDiff). */
let shownDiff = 0;
const when = (s: number) => new Date((s + shownDiff) * 1000).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export async function extendTime(page: Page, a: Record<string, unknown>, openSettings: () => Promise<string>): Promise<string> {
  const which = /eval/i.test(String(a.which ?? "submission")) ? "evaluation" : "submission";
  const label = which === "evaluation" ? /^\s*Edit Evaluation Time\s*$/i : /^\s*Extend Submission Time\s*$/i;
  const wantRefused = /^(refus|reject|block|not offered|disabled)/i.test(String(a.expect ?? ""));
  // the end is read on the STAGE page: the project's Project Details page reads other records first. Opening the
  // Settings menu moves there (open_event_settings opens the first stage tab when no gear is on screen).
  if (!/\/project\/[^/]+\/[^/?]+(\?|$)/.test(new URL(page.url()).pathname + "?") || /\/details|master_qcs|proposal/.test(page.url())) {
    await openSettings().catch(() => "");
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(500);
  }
  const before = a.checkEnd === false ? {} : await readEnd(page);
  await page.waitForTimeout(1500);
  // the screen shows SERVER times moved by localStorage.timeDiff (browser clock − server clock, seconds —
  // utils adjustForClient / adjustForServer); this server's clock is off by over an hour, so every sum is done
  // in server time and every time typed into a picker is moved onto the browser's clock
  const diff = Number(await page.evaluate(() => window.localStorage.getItem("timeDiff")).catch(() => 0)) || 0;
  const serverNow = () => Math.round(Date.now() / 1000) - diff;
  shownDiff = diff;

  // ── open it from the Settings menu (or say why it cannot be opened) ──
  const offered = await openSettings();
  const item = page.locator(".ant-dropdown:not(.ant-dropdown-hidden) [role='menuitem'], .ant-dropdown:not(.ant-dropdown-hidden) .ant-dropdown-menu-item").filter({ hasText: label }).filter({ visible: true }).first();
  if (!(await item.count().catch(() => 0))) {
    if (wantRefused) return `"${which === "evaluation" ? "Edit Evaluation Time" : "Extend Submission Time"}" is not offered in Settings (${offered}) — as expected`;
    throw new Error(`"${which === "evaluation" ? "Edit Evaluation Time" : "Extend Submission Time"}" is not in the Settings menu: ${offered}`);
  }
  if (/disabled/.test((await item.getAttribute("class").catch(() => "")) ?? "")) {
    await item.hover({ force: true }).catch(() => {});
    await page.waitForTimeout(800);
    const tip = clean((await page.locator(".ant-tooltip:not(.ant-tooltip-hidden) .ant-tooltip-inner").filter({ visible: true }).last().innerText().catch(() => "")) || "");
    const msg = `it is greyed out in Settings${tip ? ` — the tooltip says "${tip}"` : " with NO tooltip saying why"}`;
    if (wantRefused) {
      if (!tip && a.tooltip !== false) throw new Error(`[product] refused as expected, but ${msg} (every greyed-out control must say why)`);
      return msg;
    }
    throw new Error(`rejected by the app: ${msg}`);
  }
  await item.click({ timeout: 5_000 }).catch(() => item.dispatchEvent("click"));
  const dialog = page.locator(".ant-modal-content").filter({ hasText: /Increase Event Time|Evaluation|Event Time/i }).filter({ visible: true }).last();
  await dialog.waitFor({ state: "visible", timeout: 10_000 });

  // ── fill it ──
  const option = String(a.option ?? (a.at ? "fixed" : a.preset ? "preset" : "custom")).toLowerCase();
  const radio = (re: RegExp) => dialog.locator(".ant-radio-wrapper").filter({ hasText: re }).first();
  const notes: string[] = [];
  let expectEnd: ((b: { end?: number; extra?: number }, now: number) => number | undefined) | undefined;
  if (option === "preset") {
    // match by DURATION, not words: "1 Hour", "60 mins" and the app's "an hour" are the same slot
    const want = String(a.preset ?? "");
    const secsOf = (t: string) => {
      const m = /(\d+|an?)\s*(min|hour|hr|day)/i.exec(t);
      return m ? (/^an?$/i.test(m[1]) ? 1 : Number(m[1])) * UNIT[m[2][0].toLowerCase()] : undefined;
    };
    const labels = (await dialog.locator(".ant-radio-wrapper").allInnerTexts().catch(() => [] as string[])).map(clean);
    const idx = want ? labels.findIndex((l) => (secsOf(want) !== undefined && secsOf(l) === secsOf(want)) || l.toLowerCase() === want.toLowerCase()) : 0;
    if (idx < 0) throw new Error(`no ready slot "${want}" in the window (it offers: ${labels.join(", ")})`);
    const r = dialog.locator(".ant-radio-wrapper").nth(idx);
    const text = clean((await r.innerText().catch(() => "")) || "");
    await r.click({ timeout: 5_000 });
    notes.push(`chose "${text}"`);
    // "15 minutes", "30 minutes", "an hour", "2 hours", "a day"
    const m = /(\d+|an?)\s*(min|hour|hr|day)/i.exec(text);
    if (m) {
      const secs = (/^an?$/i.test(m[1]) ? 1 : Number(m[1])) * UNIT[m[2][0].toLowerCase()];
      expectEnd = (b, now) => {
        const base = which === "evaluation" ? b.extra : b.end;
        return base === undefined ? undefined : base < now ? now + secs : base + secs;
      };
    }
  } else if (option === "custom") {
    await radio(/^\s*(custom|edit evaluation duration)\s*$/i).click({ timeout: 5_000 });
    const dir = String(a.direction ?? "increase").toLowerCase();
    if (dir.startsWith("dec")) {
      const sel = dialog.locator(".ant-select").filter({ hasText: /increase by|decrease by/i }).first();
      if (await sel.count()) {
        await sel.click();
        await page.locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden) li").filter({ hasText: /decrease by/i }).first().click({ timeout: 4_000 });
        notes.push("Decrease by");
      } else notes.push('no "Decrease by" choice in this window');
    }
    const amount = a.amount === undefined ? "" : String(a.amount);
    const box = dialog.locator(".ant-input-number input").first();
    await box.fill(amount).catch(async () => {
      await box.click();
      await page.keyboard.type(amount);
    });
    const unitWord = String(a.unit ?? "minutes").toLowerCase();
    // the units read "Min(s)" / "Hour(s)" / "Day(s)" (en.json eventCreation.constants)
    const unitRe = /^\s*(min|minute|hour|hr|day)s?(\(s\))?\s*$/i;
    const unitSel = dialog.locator(".ant-select").filter({ hasText: unitRe }).last();
    const want = unitWord[0] === "h" ? /^\s*(hour|hr)s?(\(s\))?\s*$/i : unitWord[0] === "d" ? /^\s*days?(\(s\))?\s*$/i : /^\s*(min|minute)s?(\(s\))?\s*$/i;
    if (await unitSel.count()) {
      const cur = clean((await unitSel.innerText().catch(() => "")) || "");
      if (!want.test(cur)) {
        await unitSel.click().catch(() => {});
        await page.locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden) li").filter({ hasText: want }).first().click({ timeout: 4_000 });
      }
      const now = clean((await unitSel.innerText().catch(() => "")) || "");
      if (!want.test(now)) throw new Error(`could not choose "${unitWord}" in the unit list (it shows "${now}") — not evidence about the product`);
    } else if (unitWord[0] !== "m") throw new Error(`no unit list in this window to choose "${unitWord}" — not evidence about the product`);
    const shown = (await box.inputValue().catch(() => "")) || "";
    notes.push(`typed "${amount}" ${unitWord} — the box shows "${shown}"`);
    const n = Number(shown);
    if (Number.isFinite(n) && n > 0) {
      const secs = n * UNIT[unitWord[0]] * (dir.startsWith("dec") ? -1 : 1);
      expectEnd = (b, now) => {
        const base = which === "evaluation" ? b.extra : b.end;
        return base === undefined ? undefined : base < now && secs > 0 ? now + secs : base + secs;
      };
    }
  } else {
    // fixed: "E+30m" = 30 minutes after the current end, "+2h" = two hours from now, "-10m" = in the past
    await radio(/^\s*(fixed( time)?|edit evaluation ending at)\s*$/i).click({ timeout: 5_000 });
    const spec = String(a.at ?? "E+30m");
    const fromEnd = /^\s*(E|end)\b|^\s*E[+-]/i.test(spec);
    const m = /([+-])\s*(\d+)\s*(m|h|d)/i.exec(spec);
    const now = serverNow();
    const base = fromEnd ? (which === "evaluation" ? before.extra : before.end) ?? now : now;
    const target = Math.ceil((base + (m ? (m[1] === "-" ? -1 : 1) * Number(m[2]) * UNIT[m[3].toLowerCase()] : 1800)) / 60) * 60;
    const t = new Date((target + diff) * 1000); // as the picker shows it
    const input = dialog.locator(".ant-calendar-picker input").first();
    const cur = (await input.inputValue().catch(() => "")) || "";
    await input.click({ timeout: 5_000 });
    const panel = page.locator(".ant-calendar-picker-container .ant-calendar-input").filter({ visible: true }).last();
    await panel.waitFor({ state: "visible", timeout: 8_000 });
    // the panel's input takes the field's own format: write the time the same way the field shows the current one
    const pad = (x: number) => String(x).padStart(2, "0");
    const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const ord = (d: number) => `${d}${d % 10 === 1 && d !== 11 ? "st" : d % 10 === 2 && d !== 12 ? "nd" : d % 10 === 3 && d !== 13 ? "rd" : "th"}`;
    // the picker takes the company's date profile (utils getDateFormat; default "DD MMMM YYYY hh:mm A" = "30 October
    // 2026 04:33 AM"): try the usual formats until the panel accepts one (an unparsed one is marked invalid)
    const FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const H = pad(t.getHours() % 12 || 12), Mi = pad(t.getMinutes()), ap = t.getHours() < 12 ? "AM" : "PM", D = pad(t.getDate()), Y = t.getFullYear();
    const tries = [
      `${D} ${FULL[t.getMonth()]} ${Y} ${H}:${Mi} ${ap}`,
      `${D} ${MON[t.getMonth()]} ${Y} ${H}:${Mi} ${ap}`,
      `${ord(t.getDate())} ${MON[t.getMonth()]} ${Y} ${H}:${Mi} ${ap.toLowerCase()}`,
      `${D}/${pad(t.getMonth() + 1)}/${Y} ${H}:${Mi} ${ap}`,
      `${D}-${pad(t.getMonth() + 1)}-${Y} ${pad(t.getHours())}:${Mi}`,
      `${Y}-${pad(t.getMonth() + 1)}-${D} ${pad(t.getHours())}:${Mi}`,
    ];
    let text = "";
    let invalid = 0;
    for (const tryText of cur ? [cur.replace(/.*/, ""), ...tries].filter(Boolean) : tries) {
      await panel.fill(tryText);
      await page.waitForTimeout(250);
      invalid = await page.locator(".ant-calendar-picker-container .ant-calendar-input-invalid").filter({ visible: true }).count().catch(() => 0);
      text = tryText;
      if (!invalid) break;
    }
    // still invalid with every format: the day / time itself is disabled (before the end, more than 3 months ahead)
    if (invalid) notes.push(`the calendar does not allow ${tries[0]} (that day or time is disabled)`);
    await page.locator(".ant-calendar-picker-container .ant-calendar-ok-btn").filter({ visible: true }).last().click({ timeout: 3_000 }).catch(() => panel.press("Enter").catch(() => {}));
    await dialog.locator(".ant-modal-title").first().click().catch(() => {});
    notes.push(`fixed time ${text}${invalid ? "" : ` (field now "${(await input.inputValue().catch(() => "")) || ""}")`}`);
    if (!invalid) expectEnd = () => target;
  }

  // ── save and judge ──
  const sent: { body?: any; status?: number; msg?: string } = {};
  const saved = page
    .waitForResponse((r) => ["PATCH", "PUT", "POST"].includes(r.request().method()) && /\/trade\//.test(r.url()), { timeout: 12_000 })
    .then(async (r) => {
      sent.status = r.status();
      try {
        sent.body = r.request().postDataJSON();
      } catch {
        /* none */
      }
      sent.msg = await r.json().then((j: any) => String(j?.message ?? j?.error?.message ?? "")).catch(() => "");
    })
    .catch(() => undefined);
  if (a.confirm === false) return `filled, not saved: ${notes.join("; ")}`;
  await dialog.getByRole("button", { name: /^\s*ok\s*$/i }).first().click({ timeout: 5_000 });
  await page.waitForTimeout(1200);
  const help = clean(((await dialog.locator(".ant-form-explain, .ant-form-item-explain").allInnerTexts().catch(() => [])) as string[]).join(" "));
  const red = (await dialog.locator(".has-error, .ant-form-item-has-error").count().catch(() => 0)) > 0;
  const open = await dialog.isVisible().catch(() => false);
  if (!open) await saved;
  const refused = open || (sent.status !== undefined && sent.status >= 400);
  const said = help || sent.msg || (red ? "(the field turned red with no message)" : "");
  if (refused) {
    await dialog.getByRole("button", { name: /^\s*cancel\s*$/i }).first().click().catch(() => page.keyboard.press("Escape"));
    if (!wantRefused) throw new Error(`rejected by the app: ${said || "the window stayed open"} — ${notes.join("; ")}`);
    if (a.message && !said.toLowerCase().includes(String(a.message).toLowerCase())) throw new Error(`refused, but it said "${said}" — the case expects "${a.message}"`);
    if (red && !help && a.needsMessage !== false) throw new Error(`[product] refused, but the field only turned red with NO message saying why — ${notes.join("; ")}`);
    return `refused: ${said} — ${notes.join("; ")}`;
  }
  if (wantRefused) throw new Error(`[product] it SAVED (${sent.status ?? "?"}) — the case expects it to be refused; ${notes.join("; ")}`);
  // ── the sum: the end the app now holds ──
  if (a.checkEnd === false || !expectEnd) return `saved — ${notes.join("; ")}`;
  const after = await readEnd(page);
  const want = expectEnd(before, serverNow() - 5);
  const got = which === "evaluation" ? after.extra : after.end;
  const was = which === "evaluation" ? before.extra : before.end;
  if (want === undefined || got === undefined) return `saved — ${notes.join("; ")} (the end time could not be read back to check the sum)`;
  const off = Math.abs(got - want);
  const detail = `${which === "evaluation" ? "evaluation" : "submission"} end ${was ? when(was) : "?"} → ${when(got)} (expected ${when(want)})`;
  if (off > 180) throw new Error(`[product] saved, but the new end is wrong: ${detail} — ${Math.round(off / 60)} min off; ${notes.join("; ")}`);
  return `saved — ${detail}; ${notes.join("; ")}`;
}
