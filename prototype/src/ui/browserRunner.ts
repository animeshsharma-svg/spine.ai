/**
 * HEADED BROWSER AUTOMATION — watch the tests run in Chromium.
 *
 * Launches a REAL, visible Chromium (slowMo so you can follow), logs into the
 * Procol buyer console with phone + OTP (exactly like a user), then exercises
 * validation the way a Playwright UI test does — invalid phone on login, then
 * the Create-User form's field validation. Each step + screenshot streams to the
 * web UI while the Chromium window shows it live.
 *
 * (DB-session injection is currently rejected by the console app, so we use the
 * real OTP login for the demo buyer — clientA.)
 */
import { config as loadEnv } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdirSync, existsSync, rmSync } from "node:fs";
import { chromium, Page } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const PROTO = join(here, "..", "..");
const PROCOL_TEST = join(PROTO, "..", "procol test");
const UITESTS = join(PROTO, "..", "procol-ui-tests");
const SHOTS_DIR = join(PROTO, "public", "shots");
loadEnv({ path: join(PROTO, ".env") });
loadEnv({ path: join(PROCOL_TEST, ".env") });

export interface UiStepEvent {
  agent: "UI";
  status: "reasoning" | "shot" | "check" | "done" | "error";
  title: string;
  data?: any;
}
export type UiEmit = (e: UiStepEvent) => void;

export interface UiCheckResult {
  id: string;
  scenario: string;
  field?: string;
  expected: "accept" | "reject";
  layer: "ui";
  pass: boolean;
  observed: string;
  screenshot?: string;
  durationMs: number;
}

async function loadUi() {
  const lp: any = await import(pathToFileURL(join(UITESTS, "src", "pages", "LoginPage.ts")).href);
  const cfg: any = await import(pathToFileURL(join(UITESTS, "src", "config.ts")).href);
  return { LoginPage: lp.LoginPage, CONFIG: cfg.CONFIG };
}

// ── inline resilient helpers ──────────────────────────────────────────────
async function clickBtn(page: Page, re: RegExp, timeout = 5000): Promise<boolean> {
  await dismissPopups(page).catch(() => {});
  const b = page.getByRole("button", { name: re }).first();
  try {
    await b.waitFor({ state: "visible", timeout });
    await b.click({ timeout: 2500 });
    return true;
  } catch {
    // a popup may have covered it — clear popups and force through
    await dismissPopups(page).catch(() => {});
    try {
      await b.click({ timeout: 2000, force: true });
      return true;
    } catch {
      return false;
    }
  }
}
async function fillByName(page: Page, name: string, value: string): Promise<boolean> {
  const l = page.locator(`input[name="${name}"], textarea[name="${name}"]`).first();
  try {
    await l.waitFor({ state: "visible", timeout: 4000 });
    await l.click().catch(() => {});
    await l.fill("").catch(() => {});
    if (value) await l.pressSequentially(value, { delay: 25 });
    return true;
  } catch {
    return false;
  }
}
/**
 * Dismiss the console's interstitial popups (they appear at random times):
 *  - "Want to stay updated?" browser-notification prompt → "Not now"
 *  - "Hello Procol / Give us feedback" card → the ✕ close icon
 *  - any antd modal / notification / drawer close ✕
 * Safe, specific targets only (never clicks Logout / Give Feedback / Yes).
 */
async function dismissPopups(page: Page): Promise<void> {
  // 1) safe dismiss buttons (exact-ish so we never hit "Yes, I'm in" / "Give Feedback").
  for (const re of [/^not now$/i, /^no,? thanks$/i, /^maybe later$/i, /^skip( for now)?$/i, /^dismiss$/i]) {
    const b = page.getByRole("button", { name: re }).first();
    try {
      if (await b.isVisible({ timeout: 120 })) {
        await b.click({ timeout: 1000 });
        await page.waitForTimeout(150);
      }
    } catch {
      /* ignore */
    }
  }
  // 2) ✕ on TOAST/BANNER/notification only — NEVER a modal/drawer close (that would
  //    close the form we're testing). These selectors are specific to transient alerts.
  for (const sel of [".ant-notification-notice-close", ".ant-alert-close-icon", ".ant-message-notice-close"]) {
    const c = page.locator(sel).first();
    try {
      if (await c.isVisible({ timeout: 100 })) {
        await c.click({ timeout: 800, force: true });
        await page.waitForTimeout(120);
      }
    } catch {
      /* ignore */
    }
  }
  // 3) the "stay updated" / feedback CARD: close only via a control INSIDE the card
  //    that carries the popup's own text, so we can't hit the drawer's close.
  for (const textRe of [/want to stay updated/i, /help us make procol better/i]) {
    const card = page.locator("div").filter({ hasText: textRe }).last();
    try {
      if (await card.isVisible({ timeout: 100 })) {
        const closeIcon = card.locator("[class*='close' i], svg").last();
        if ((await closeIcon.count()) > 0) await closeIcon.click({ timeout: 700, force: true }).catch(() => {});
      }
    } catch {
      /* ignore */
    }
  }
}

/** Continuously kill popups in the background for the whole session. */
function startPopupWatcher(page: Page): () => void {
  let alive = true;
  (async () => {
    while (alive) {
      await dismissPopups(page).catch(() => {});
      await page.waitForTimeout(1200);
    }
  })();
  return () => {
    alive = false;
  };
}
async function pickRole(page: Page): Promise<boolean> {
  try {
    // The Role select is the ant-select whose placeholder mentions "role"
    // (avoids the +91 prefix select and the team select).
    let target = page.locator(".ant-select", { has: page.getByText(/role/i) }).first();
    if ((await target.count()) === 0) {
      target = page.locator(".ant-form-item").filter({ hasText: /Role/ }).locator(".ant-select").first();
    }
    await target.click({ timeout: 2500 });
    await page.waitForTimeout(600);
    // Keyboard-select the first option — robust across antd's portal-rendered menus.
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(200);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
    return true;
  } catch {
    return false;
  }
}
async function readValidation(page: Page): Promise<{ kind: string; text: string }> {
  await page.waitForTimeout(1000);
  const err = page.locator(".ant-form-item-explain-error, p[role='alert']").first();
  if ((await err.count().catch(() => 0)) > 0) {
    const t = (await err.innerText().catch(() => "")) || "";
    if (t.trim()) return { kind: "field-error", text: t.trim().replace(/\s+/g, " ").slice(0, 140) };
  }
  const ok = page.locator(".ant-message-success, .ant-notification-notice-success").first();
  if ((await ok.count().catch(() => 0)) > 0) return { kind: "success", text: "creation succeeded (success toast)" };
  const et = page.locator(".ant-message-error, .ant-notification-notice-error").first();
  if ((await et.count().catch(() => 0)) > 0) {
    const t = (await et.innerText().catch(() => "")) || "";
    return { kind: "error-toast", text: t.trim().replace(/\s+/g, " ").slice(0, 140) };
  }
  return { kind: "none", text: "no explicit validation message surfaced" };
}

export async function runUiAutomation(companyId: number, emit: UiEmit): Promise<UiCheckResult[]> {
  if (existsSync(SHOTS_DIR)) rmSync(SHOTS_DIR, { recursive: true, force: true });
  mkdirSync(SHOTS_DIR, { recursive: true });

  const { LoginPage, CONFIG } = await loadUi();
  const base = String(CONFIG.appUrl).replace(/\/$/, "");
  const results: UiCheckResult[] = [];
  let shotN = 0;
  const rid = Math.floor(Math.random() * 1e6);

  emit({ agent: "UI", status: "reasoning", title: "Launching Chromium (headed — watch the window)…" });
  const browser = await chromium.launch({ headless: false, slowMo: 140, args: ["--start-maximized"] });
  const context = await browser.newContext({ viewport: null });
  const page = await context.newPage();
  const stopWatcher = startPopupWatcher(page); // continuously dismiss interstitial popups

  const shot = async (label: string): Promise<string> => {
    const f = `${String(++shotN).padStart(2, "0")}.png`;
    await page.screenshot({ path: join(SHOTS_DIR, f) }).catch(() => {});
    const url = `/shots/${f}?t=${Date.now()}`;
    emit({ agent: "UI", status: "shot", title: label, data: { screenshot: url } });
    return url;
  };
  const record = (r: UiCheckResult) => {
    results.push(r);
    emit({ agent: "UI", status: "check", title: `${r.id} ${r.pass ? "✓" : "✗"} ${r.scenario}`, data: { check: r } });
  };

  try {
    const lp = new LoginPage(page);
    emit({ agent: "UI", status: "reasoning", title: `Opening ${base}/login …` });
    await lp.goto();
    await page.waitForTimeout(1200);
    await shot("Login page");

    const fillPhone = async (v: string) => {
      const p = page.locator('input[type="text"], input[type="tel"]').first();
      await p.click().catch(() => {});
      await p.fill("").catch(() => {});
      await p.pressSequentially(v, { delay: 55 }).catch(() => {});
    };

    // ── UI-LOGIN-01: invalid phone is rejected ──
    {
      const t = Date.now();
      emit({ agent: "UI", status: "reasoning", title: "UI-LOGIN-01 — invalid phone number is rejected" });
      await fillPhone("12345");
      await clickBtn(page, /send otp|get otp|continue|next/i, 4000);
      const otpAppeared = await page.locator('input[type="password"]').first().isVisible({ timeout: 2500 }).catch(() => false);
      const v = await readValidation(page);
      const sc = await shot("UI-LOGIN-01: invalid phone submitted");
      record({ id: "UI-LOGIN-01", scenario: "Invalid phone number is rejected on login", field: "phone", expected: "reject", layer: "ui", pass: !otpAppeared, observed: otpAppeared ? "OTP step appeared (invalid phone accepted)" : `blocked — ${v.text}`, screenshot: sc, durationMs: Date.now() - t });
    }

    // ── UI-LOGIN-02: wrong OTP is rejected ──
    await lp.goto();
    await page.waitForTimeout(800);
    await dismissPopups(page);
    {
      const t = Date.now();
      emit({ agent: "UI", status: "reasoning", title: "UI-LOGIN-02 — a wrong OTP is rejected" });
      await fillPhone(CONFIG.buyerPhone);
      await clickBtn(page, /send otp|get otp|continue|next/i, 5000);
      const otpField = page.locator('input[type="password"]').first();
      await otpField.waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
      await otpField.fill("000000").catch(() => {});
      await shot("UI-LOGIN-02: entered a wrong OTP");
      (await clickBtn(page, /^log ?in$/i, 4000)) || (await clickBtn(page, /submit/i, 3000));
      await page.waitForTimeout(1200);
      const left = !new URL(page.url()).pathname.includes("/login");
      const sc = await shot("UI-LOGIN-02: after submitting wrong OTP");
      record({ id: "UI-LOGIN-02", scenario: "Wrong OTP is rejected", field: "otp", expected: "reject", layer: "ui", pass: !left, observed: left ? "logged in with a wrong OTP!" : "rejected — wrong OTP not accepted (stayed on the login page)", screenshot: sc, durationMs: Date.now() - t });
    }

    // ── real login (correct OTP) ──
    await lp.goto();
    await page.waitForTimeout(800);
    await dismissPopups(page);
    emit({ agent: "UI", status: "reasoning", title: `Logging in as the demo buyer (${CONFIG.buyerPhone}) with the correct OTP…` });
    await lp.login();
    await page.waitForTimeout(1800);
    await dismissPopups(page);
    await shot("Logged into the Procol console");

    // ── navigate the real console (visible) ──
    emit({ agent: "UI", status: "reasoning", title: "Navigating to /users …" });
    await page.goto(`${base}/users`).catch(() => {});
    await page.waitForTimeout(1400);
    await dismissPopups(page);
    await shot("Console page: /users");

    // ── Create-User form validation (best-effort — skips cleanly if no access) ──
    const attempt = async (
      id: string,
      scenario: string,
      field: string | undefined,
      expected: "accept" | "reject",
      fields: { name?: string; email?: string; phone?: string },
    ): Promise<boolean> => {
      const t = Date.now();
      emit({ agent: "UI", status: "reasoning", title: `${id} — ${scenario}` });
      await page.goto(`${base}/users`).catch(() => {});
      await page.waitForTimeout(900);
      await dismissPopups(page);
      const opened = await clickBtn(page, /create user|add user|new user/i, 5000);
      if (!opened) {
        emit({ agent: "UI", status: "reasoning", title: "Create-User form not available on this console — skipping form checks." });
        return false;
      }
      await page.waitForTimeout(600);
      await dismissPopups(page);
      if (fields.name !== undefined) await fillByName(page, "name", fields.name);
      if (fields.email !== undefined) await fillByName(page, "email", fields.email);
      if (fields.phone !== undefined) await fillByName(page, "phone", fields.phone);
      await pickRole(page); // Role is mandatory — pick the first option so only the tested field varies
      await dismissPopups(page);
      await shot(`${id}: filled the form`);
      await dismissPopups(page);
      await clickBtn(page, /^(submit|create|save|create user)$/i, 4000);
      await page.waitForTimeout(1300);
      const v = await readValidation(page);
      // The form staying open (Name input still visible) = submission was blocked.
      const formStillOpen = await page.locator('input[name="name"]').first().isVisible().catch(() => false);
      const fieldError = v.kind === "field-error";
      const success = v.kind === "success";
      let pass: boolean;
      let observed: string;
      if (expected === "accept") {
        pass = success || !formStillOpen;
        observed = success ? "created (success toast)" : !formStillOpen ? "created — form closed" : "form stayed open (not created)";
      } else {
        pass = fieldError || (formStillOpen && !success);
        observed = fieldError
          ? `rejected — validation: ${v.text}`
          : formStillOpen
            ? "rejected — submission blocked, form stayed open (mandatory field enforced)"
            : "ACCEPTED — form submitted despite the invalid input (possible gap)";
      }
      const sc = await shot(`${id}: ${pass ? "as expected" : "check"}`);
      record({ id, scenario, field, expected, layer: "ui", pass, observed, screenshot: sc, durationMs: Date.now() - t });
      await page.keyboard.press("Escape").catch(() => {});
      await page.waitForTimeout(500);
      return true;
    };

    const ok = await attempt("UI-USR-01", "Create a user with valid details", undefined, "accept", {
      name: `UI_Auto_User_${rid}`,
      email: `ui_auto_${rid}@example.com`,
      phone: `98${String(rid).padStart(8, "0")}`.slice(0, 10),
    });
    if (ok) {
      await attempt("UI-USR-02", "Empty mandatory Name is rejected", "name", "reject", {
        name: "",
        email: `ui_auto_${rid + 2}@example.com`,
        phone: `98${String(rid + 2).padStart(8, "0")}`.slice(0, 10),
      });
    }

    emit({ agent: "UI", status: "done", title: `UI automation complete — ${results.filter((r) => r.pass).length}/${results.length} behaved as expected` });
  } catch (err: any) {
    await shot("state when the error occurred").catch(() => {});
    emit({ agent: "UI", status: "error", title: `UI automation error: ${err?.message ?? String(err)}` });
  } finally {
    stopWatcher();
    await page.waitForTimeout(1200);
    await browser.close().catch(() => {});
  }
  return results;
}
