import type { Page } from "@playwright/test";

/**
 * WHAT THE APP IS SAYING — toasts, inline errors, tooltips, dialogs.
 *
 * An antd toast is gone in about three seconds, usually before a later step
 * thinks to look. Plan runs install an in-page recorder (window.__qaToasts,
 * see oracle/evidence.ts) that keeps every toast it ever saw; reading that
 * journal from a mark taken at the start of the step catches a message that
 * has already faded. On-screen reads cover the rest.
 */

export type MessageKind = "toast" | "error" | "warning" | "success" | "tooltip" | "inline" | "modal" | "any";

export interface SeenMessage {
  kind: string;
  text: string;
}

const clean = (t: string) => t.replace(/\s+/g, " ").trim();

/** How many toasts the in-page journal holds now — a mark to read "new since". */
export async function toastMark(page: Page): Promise<number> {
  return page.evaluate(() => ((window as any).__qaToasts ?? []).length).catch(() => 0);
}

async function journalSince(page: Page, mark: number): Promise<SeenMessage[]> {
  const list = (await page.evaluate(() => (window as any).__qaToasts ?? []).catch(() => [])) as Array<{ severity: string; text: string }>;
  return list.slice(mark).map((t) => ({ kind: t.severity === "error" ? "error" : t.severity === "warning" ? "warning" : t.severity === "success" ? "success" : "toast", text: clean(t.text) }));
}

const SELECTORS: Record<string, string> = {
  error: ".ant-message-error, .ant-notification-notice-error, .ant-alert-error",
  warning: ".ant-message-warning, .ant-notification-notice-warning, .ant-alert-warning",
  success: ".ant-message-success, .ant-notification-notice-success, .ant-alert-success",
  toast: ".ant-message-notice, .ant-notification-notice, .Toastify__toast",
  inline: ".ant-form-explain, .ant-form-item-explain-error, .ant-form-item-explain, .has-error .ant-form-explain, [role='alert']",
  tooltip: "[role='tooltip'], .ant-tooltip:not(.ant-tooltip-hidden) .ant-tooltip-inner, .ant-popover:not(.ant-popover-hidden) .ant-popover-inner-content",
  modal: ".ant-modal-content, .ant-modal-confirm-content, [role='dialog'] .ant-modal-body",
};

/** Messages of a kind visible on screen right now. */
export async function visibleMessages(page: Page, kind: MessageKind): Promise<SeenMessage[]> {
  const kinds = kind === "any" ? Object.keys(SELECTORS) : kind === "toast" ? ["toast", "error", "warning", "success"] : kind === "error" ? ["error", "inline"] : [kind];
  const out: SeenMessage[] = [];
  for (const k of kinds) {
    const sel = SELECTORS[k];
    if (!sel) continue;
    const loc = page.locator(sel).filter({ visible: true });
    const n = Math.min(await loc.count().catch(() => 0), 10);
    for (let i = 0; i < n; i++) {
      const text = clean((await loc.nth(i).innerText().catch(() => "")) || "");
      if (text && !out.some((m) => m.text === text)) out.push({ kind: k, text: text.slice(0, 300) });
    }
  }
  return out;
}

/**
 * Wait (bounded) for a message of this kind — optionally containing `want` —
 * counting toasts the journal saw since `mark` as well as what is on screen.
 * Returns every message seen, and whether one matched.
 */
export async function waitForMessage(
  page: Page,
  kind: MessageKind,
  opts: { want?: string; mark?: number; timeoutMs?: number },
): Promise<{ matched: SeenMessage | null; seen: SeenMessage[] }> {
  const deadline = Date.now() + Math.max(500, opts.timeoutMs ?? 10_000);
  const n = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const accept = (m: SeenMessage) => {
    if (kind === "error" && !["error", "inline", "warning"].includes(m.kind)) return false;
    if (kind === "warning" && m.kind !== "warning") return false;
    if (kind === "success" && m.kind !== "success") return false;
    if (kind === "tooltip" && m.kind !== "tooltip") return false;
    if (kind === "modal" && m.kind !== "modal") return false;
    if (kind === "inline" && m.kind !== "inline") return false;
    return !opts.want || n(m.text).includes(n(opts.want));
  };
  let seen: SeenMessage[] = [];
  do {
    const journal = opts.mark !== undefined && kind !== "tooltip" && kind !== "modal" && kind !== "inline" ? await journalSince(page, opts.mark) : [];
    const onScreen = await visibleMessages(page, kind);
    for (const m of [...journal, ...onScreen]) if (!seen.some((x) => x.text === m.text)) seen.push(m);
    const hit = seen.find(accept);
    if (hit) return { matched: hit, seen };
    await page.waitForTimeout(300);
  } while (Date.now() < deadline);
  seen = seen.slice(0, 8);
  return { matched: null, seen };
}
