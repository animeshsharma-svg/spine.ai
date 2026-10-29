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
const isOrderRead = (r: Response) => r.request().method() === "GET" && /\/trade\/[A-Za-z0-9_-]+(\?|$)/.test(new URL(r.url()).pathname + (new URL(r.url()).search ? "?" : ""));

/** Reload the screen and read the event's end from the app's own read of it. */
async function readEnd(page: Page): Promise<{ end?: number; extra?: number }> {
  const got = page.waitForResponse((r) => isOrderRead(r) && r.status() < 400, { timeout: 30_000 }).then((r) => r.json().then(endsIn).catch(() => ({}))).catch(() => ({}));
  await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
  return got;
}

const when = (s: number) => new Date(s * 1000).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export async function extendTime(page: Page, a: Record<string, unknown>, openSettings: () => Promise<string>): Promise<string> {
  const which = /eval/i.test(String(a.which ?? "submission")) ? "evaluation" : "submission";
  const label = which === "evaluation" ? /^\s*Edit Evaluation Time\s*$/i : /^\s*Extend Submission Time\s*$/i;
  const wantRefused = /^(refus|reject|block|not offered|disabled)/i.test(String(a.expect ?? ""));
  const before = a.checkEnd === false ? {} : await readEnd(page);
  await page.waitForTimeout(1500);

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
      if (!tip && a.tooltip !== false) throw new Error(`refused as expected, but ${msg} (every greyed-out control must say why)`);
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
    const want = String(a.preset ?? "");
    const r = want ? radio(new RegExp(want.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")) : dialog.locator(".ant-radio-wrapper").first();
    const text = clean((await r.innerText().catch(() => "")) || "");
    await r.click({ timeout: 5_000 });
    notes.push(`chose "${text}"`);
    const m = /(\d+)\s*(min|hour|hr|day)/i.exec(text);
    if (m) {
      const secs = Number(m[1]) * UNIT[m[2][0].toLowerCase()];
      expectEnd = (b, now) => {
        const base = which === "evaluation" ? b.extra : b.end;
        return base === undefined ? undefined : base < now ? now + secs : base + secs;
      };
    }
  } else if (option === "custom") {
    await radio(/^\s*(custom|edit evaluation duration)\s*$/i).click({ timeout: 5_000 }).catch(() => {});
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
    const unitSel = dialog.locator(".ant-select").filter({ hasText: /^(minutes?|mins?|hours?|hrs?|days?)$/i }).last();
    if (await unitSel.count()) {
      await unitSel.click().catch(() => {});
      await page.locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden) li").filter({ hasText: new RegExp(`^\\s*${unitWord[0] === "h" ? "hours?|hrs?" : unitWord[0] === "d" ? "days?" : "minutes?|mins?"}\\s*$`, "i") }).first().click({ timeout: 4_000 }).catch(() => {});
    }
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
    await radio(/^\s*(fixed|edit evaluation ending at)\s*$/i).click({ timeout: 5_000 }).catch(() => {});
    const spec = String(a.at ?? "E+30m");
    const fromEnd = /^\s*E/i.test(spec);
    const m = /([+-])\s*(\d+)\s*(m|h|d)/i.exec(spec);
    const now = Math.round(Date.now() / 1000);
    const base = fromEnd ? (which === "evaluation" ? before.extra : before.end) ?? now : now;
    const target = base + (m ? (m[1] === "-" ? -1 : 1) * Number(m[2]) * UNIT[m[3].toLowerCase()] : 1800);
    const t = new Date(Math.ceil(target / 60) * 60 * 1000);
    const input = dialog.locator(".ant-calendar-picker input").first();
    const cur = (await input.inputValue().catch(() => "")) || "";
    await input.click({ timeout: 5_000 });
    const panel = page.locator(".ant-calendar-picker-container .ant-calendar-input").filter({ visible: true }).last();
    await panel.waitFor({ state: "visible", timeout: 8_000 });
    // the panel's input takes the field's own format: write the time the same way the field shows the current one
    const pad = (x: number) => String(x).padStart(2, "0");
    const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const ord = (d: number) => `${d}${d % 10 === 1 && d !== 11 ? "st" : d % 10 === 2 && d !== 12 ? "nd" : d % 10 === 3 && d !== 13 ? "rd" : "th"}`;
    const h12 = `${pad(t.getHours() % 12 || 12)}:${pad(t.getMinutes())} ${t.getHours() < 12 ? "am" : "pm"}`;
    const text = /\d(st|nd|rd|th)\s/i.test(cur) ? `${ord(t.getDate())} ${MON[t.getMonth()]} ${t.getFullYear()} ${/am|pm/i.test(cur) ? h12 : `${pad(t.getHours())}:${pad(t.getMinutes())}`}` : /^\d{2}\/\d{2}\/\d{4}/.test(cur) ? `${pad(t.getDate())}/${pad(t.getMonth() + 1)}/${t.getFullYear()} ${/am|pm/i.test(cur) ? h12 : `${pad(t.getHours())}:${pad(t.getMinutes())}`}` : `${pad(t.getDate())} ${MON[t.getMonth()]} ${t.getFullYear()} ${h12}`;
    await panel.fill(text);
    await page.waitForTimeout(200);
    const invalid = await page.locator(".ant-calendar-picker-container .ant-calendar-input-invalid").filter({ visible: true }).count().catch(() => 0);
    if (invalid) notes.push(`the calendar does not allow ${text} (that day or time is disabled)`);
    await page.locator(".ant-calendar-picker-container .ant-calendar-ok-btn").filter({ visible: true }).last().click({ timeout: 3_000 }).catch(() => panel.press("Enter").catch(() => {}));
    await dialog.locator(".ant-modal-title").first().click().catch(() => {});
    notes.push(`fixed time ${text}${invalid ? "" : ` (field now "${(await input.inputValue().catch(() => "")) || ""}")`}`);
    if (!invalid) expectEnd = () => Math.round(t.getTime() / 1000);
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
    if (red && !help && a.needsMessage !== false) throw new Error(`refused, but the field only turned red with NO message saying why — ${notes.join("; ")}`);
    return `refused: ${said} — ${notes.join("; ")}`;
  }
  if (wantRefused) throw new Error(`it SAVED (${sent.status ?? "?"}) — the case expects it to be refused; ${notes.join("; ")}`);
  // ── the sum: the end the app now holds ──
  if (a.checkEnd === false || !expectEnd) return `saved — ${notes.join("; ")}`;
  const after = await readEnd(page);
  const now = Math.round(Date.now() / 1000);
  const want = expectEnd(before, now - 5);
  const got = which === "evaluation" ? after.extra : after.end;
  const was = which === "evaluation" ? before.extra : before.end;
  if (want === undefined || got === undefined) return `saved — ${notes.join("; ")} (the end time could not be read back to check the sum)`;
  const off = Math.abs(got - want);
  const detail = `${which === "evaluation" ? "evaluation" : "submission"} end ${was ? when(was) : "?"} → ${when(got)} (expected ${when(want)})`;
  if (off > 180) throw new Error(`saved, but the new end is wrong: ${detail} — ${Math.round(off / 60)} min off; ${notes.join("; ")}`);
  return `saved — ${detail}; ${notes.join("; ")}`;
}
