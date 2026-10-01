import type { CapturedResponse } from "./capture.js";
import type { ScreenSnapshot } from "./screenText.js";
import { findDate, findText, numbersIn, toInstant, normText } from "./normalize.js";

/**
 * AUTO-DISCOVERY — which payload values are visible on this screen, and where.
 *
 * Every leaf of every JSON response captured on the screen is looked for in
 * the screen's text with the same normalisation the checks use. The output is
 * EVIDENCE for writing a reviewed map, not a verdict: a value that happens to
 * be "1" is on every screen, so leaves are filtered to ones that are
 * distinctive enough to mean something when found.
 */

export interface DiscoveredField {
  /** Route + JSON path with array indexes generalised: event_groups/:id → stages[].ref_id */
  route: string;
  path: string;
  /** How the value matched: text / number / datetime. */
  as: "text" | "number" | "datetime";
  /** How many instances were found / looked for. */
  found: number;
  total: number;
  example: string;
  /** Where the first match sat (segment hint) and its text. */
  where?: string;
  seenAs?: string;
}

/** App-wide calls (menus, permissions, approvals inbox) that every screen makes; never this screen's data. */
const APP_WIDE = /dashboard_configuration|pending_tasks|approval_requests|\/v1\/config\/|user_preferences|notification|chats\/|server_current_time|filter_options|tab_counts/;
const ID_LIKE = /^[A-Za-z0-9+/]{6,}={0,2}$/;
const SKIP_KEY = /(^|_)(uuid|id|ids|key|nanoid|url|image|icon|color|cursor|hash|token|version)$/i;

function leaves(v: unknown, path: string, out: Array<{ path: string; value: unknown }>, depth = 0): void {
  if (depth > 12 || out.length > 4000) return;
  if (Array.isArray(v)) {
    v.slice(0, 25).forEach((e) => leaves(e, `${path}[]`, out, depth + 1));
    return;
  }
  if (v && typeof v === "object") {
    for (const [k, e] of Object.entries(v as Record<string, unknown>)) {
      // Object keys that are ids (vendor uuids keyed maps) generalise to {}.
      const seg = ID_LIKE.test(k) && /[A-Z]/.test(k) && /[a-z]/.test(k) ? "{}" : k;
      leaves(e, path ? `${path}.${seg}` : seg, out, depth + 1);
    }
    return;
  }
  out.push({ path, value: v });
}

function distinctive(path: string, v: unknown): "text" | "number" | "datetime" | null {
  const last = path.split(".").pop() ?? "";
  if (SKIP_KEY.test(last.replace(/\[\]$/, ""))) return null;
  if (typeof v === "boolean" || v === null || v === undefined) return null;
  if (toInstant(v) !== null && /(_at|time|from|date)$/i.test(last)) return "datetime";
  // Small numbers (0–9) appear on every screen; finding one proves nothing.
  if (typeof v === "number") return Math.abs(v) >= 10 ? "number" : null;
  if (typeof v === "string") {
    const s = v.trim();
    if (s.length < 3 || s.length > 200) return null;
    if (ID_LIKE.test(s) && /\d/.test(s) && /[A-Z]/.test(s) && !/\s/.test(s) && !/-/.test(s)) return null;
    if (/^https?:/.test(s)) return null;
    if (/^-?\d+(\.\d+)?$/.test(s)) return Math.abs(Number(s)) >= 10 ? "number" : null;
    return "text";
  }
  return null;
}

export function discover(snap: ScreenSnapshot, responses: CapturedResponse[]): DiscoveredField[] {
  const agg = new Map<string, DiscoveredField>();
  const texts = snap.segments.map((s) => s.text);
  const allNumbers = new Set(numbersIn(snap.text).map((n) => Math.round(n * 100)));
  for (const r of responses) {
    if (!r.ok || r.body === null || APP_WIDE.test(r.path)) continue;
    const ls: Array<{ path: string; value: unknown }> = [];
    leaves(r.body, "", ls);
    for (const { path, value } of ls) {
      const as = distinctive(path, value);
      if (!as) continue;
      const key = `${r.route} ${path}`;
      const d = agg.get(key) ?? { route: `${r.method} ${r.route}`, path, as, found: 0, total: 0, example: String(value).slice(0, 80) };
      d.total += 1;
      let hit: { where?: string; seen?: string } | null = null;
      if (as === "text") {
        const m = findText(String(value), texts);
        if (m.ok) hit = { seen: m.seen, where: snap.segments.find((s) => s.text === m.seen)?.where };
      } else if (as === "number") {
        const n = Number(value);
        if (allNumbers.has(Math.round(n * 100))) hit = { seen: String(value) };
      } else {
        const t = toInstant(value)!;
        const m = findDate(t, snap.text);
        if (m.ok) hit = { seen: m.seen.find(Boolean)?.text };
      }
      if (hit) {
        d.found += 1;
        d.where ??= hit.where;
        d.seenAs ??= hit.seen;
      }
      agg.set(key, d);
    }
  }
  return [...agg.values()]
    .filter((d) => d.found > 0)
    .sort((a, b) => a.route.localeCompare(b.route) || normText(a.path).localeCompare(normText(b.path)));
}
