/**
 * NORMALISATION — how an API value and a screen text are compared fairly.
 *
 * The console never shows a payload verbatim: 5301 is "₹ 5,301", 57 is "57 KG",
 * 1790768888 is "30 September 2026 05:18 PM" (IST), "bid_placed" is "Bid placed",
 * a long name is "Stainless st…". A string comparison would call every one of
 * those a mismatch, and a checker that cries wolf on every cell gets ignored.
 *
 * So every comparison here is by MEANING:
 *   numbers   — every number in the screen text is parsed (Indian and western
 *               grouping, currency symbols, units, a leading minus) and compared
 *               numerically, within the precision the API itself declares;
 *   dates     — every date/time in the text is parsed (the console's several
 *               formats) and compared as an instant in Asia/Kolkata, to the
 *               minute when a time is shown and to the day when only a date is;
 *   durations — "0 second", "30 Mins", "1 hour" are parsed to seconds and
 *               compared within the displayed unit;
 *   text      — case, whitespace and snake_case are folded; a visibly truncated
 *               text ("…"/"...") matches when it is a prefix of the full value.
 *
 * Nothing here is fuzzy in the statistical sense. Every rule is a rule a
 * person would agree with, and each one says why it matched.
 */

export const TZ = "Asia/Kolkata";
const IST_OFFSET_MIN = 330;

// ── text ────────────────────────────────────────────────────────────────────
export function normText(s: unknown): string {
  return String(s ?? "")
    .normalize("NFKC")
    .replace(/[_\s]+/g, " ")
    .replace(/[:：]\s*$/, "")
    .trim()
    .toLowerCase();
}

/** The API's snake_case key as a person would write it: bid_placed → "bid placed". */
export function humanise(key: string): string {
  return normText(key.replace(/([a-z])([A-Z])/g, "$1 $2"));
}

export interface TextMatch {
  ok: boolean;
  how?: "exact" | "contains" | "truncated" | "case-folded";
  /** The screen text that matched (or the closest candidate when not ok). */
  seen?: string;
}

const TRUNC = /(…|\.\.\.)\s*$/;

/** Is `want` present in any of `texts` (segments or row texts)? */
export function findText(want: string, texts: string[]): TextMatch {
  const w = normText(want);
  if (!w) return { ok: false };
  for (const t of texts) {
    const n = normText(t);
    if (n === w) return { ok: true, how: "exact", seen: t };
  }
  for (const t of texts) {
    const n = normText(t);
    if (n.includes(w)) return { ok: true, how: "contains", seen: t };
  }
  for (const t of texts) {
    if (!TRUNC.test(t)) continue;
    const prefix = normText(t.replace(TRUNC, ""));
    if (prefix.length >= 6 && w.startsWith(prefix)) return { ok: true, how: "truncated", seen: t };
  }
  return { ok: false };
}

// ── numbers ─────────────────────────────────────────────────────────────────
/** A number as the API sent it: 5301, "5301.0", "-37", "57.0 KG", "₹ 5,301". */
export function toNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const m = v.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  // "₹ -2,109" and "₹-2,109" both mean minus; "57-60" is not a number we trust.
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

/** Every number written in a piece of screen text, in order. */
export function numbersIn(text: string): number[] {
  const out: number[] = [];
  // A minus counts only when it sits right before the digits or after a
  // currency symbol ("₹-2,109", "▼-66.07%"), never as a range dash "1-5".
  const re = /(^|[^\d.,])(-?)\s?(\d{1,3}(?:,\d{2,3})+(?:\.\d+)?|\d+(?:\.\d+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const lead = m[1];
    const minus = m[2] === "-" && !/[\w)]$/.test(lead);
    const n = Number(m[3].replace(/,/g, ""));
    if (Number.isFinite(n)) out.push(minus ? -n : n);
  }
  return out;
}

/** Tolerance for a value shown at `precision` decimals (half a unit in the last place). */
export function tolerance(precision?: number | null, value?: number): number {
  const p = typeof precision === "number" && precision >= 0 ? Math.min(precision, 4) : 2;
  const base = 0.5 * 10 ** -p;
  // Large amounts are commonly shown rounded to the rupee even when the
  // template says 2 decimals ("₹ 5,301" for 5301.0) — that is the same value.
  return value !== undefined && Math.abs(value) >= 1000 ? Math.max(base, 0.5) : base + 1e-9;
}

export interface NumberMatch {
  ok: boolean;
  /** The numbers the scope actually shows — the evidence when not ok. */
  seen: number[];
}

export function findNumber(want: number, text: string, precision?: number | null): NumberMatch {
  const seen = numbersIn(text);
  const tol = tolerance(precision, want);
  return { ok: seen.some((n) => Math.abs(n - want) <= tol), seen };
}

// ── dates ───────────────────────────────────────────────────────────────────
const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
};

/** An API time: epoch seconds, epoch ms, or an ISO string → epoch ms. */
export function toInstant(v: unknown): number | null {
  if (typeof v === "number") {
    if (v > 1e12 && v < 4e12) return v;
    if (v > 1e9 && v < 4e9) return v * 1000;
    return null;
  }
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

export interface ShownDate {
  /** Epoch ms of the shown local (IST) time; minute precision when a time was shown. */
  at: number;
  hasTime: boolean;
  text: string;
}

/** Wall-clock parts in IST → epoch ms. */
function istToEpoch(y: number, mo: number, d: number, h = 0, mi = 0): number {
  return Date.UTC(y, mo, d, h, mi) - IST_OFFSET_MIN * 60_000;
}

/** Every date the console writes in a piece of text. */
export function datesIn(text: string): ShownDate[] {
  const out: ShownDate[] = [];
  const time = String.raw`(?:,?\s*(?:at\s+)?(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap]\.?m\.?)?)?`;
  const mon = String.raw`(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?`;
  const patterns: Array<{ re: RegExp; parts: (m: RegExpExecArray) => [number, number, number] | null; t: number }> = [
    // 30 September 2026 05:18 PM · 27 Sep 2026, 07:44 PM · 30th Sep 2026
    { re: new RegExp(String.raw`\b(\d{1,2})(?:st|nd|rd|th)?\s+${mon},?\s+(\d{4})${time}`, "gi"), parts: (m) => [Number(m[3]), MONTHS[m[2].toLowerCase().slice(0, 3)], Number(m[1])], t: 4 },
    // Sep 30, 2026 07:44 PM
    { re: new RegExp(String.raw`\b${mon}\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})${time}`, "gi"), parts: (m) => [Number(m[3]), MONTHS[m[1].toLowerCase().slice(0, 3)], Number(m[2])], t: 4 },
    // 30/09/2026 · 30-09-2026 (day first, as en-IN writes it)
    { re: new RegExp(String.raw`\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})${time}`, "g"), parts: (m) => [Number(m[3]), Number(m[2]) - 1, Number(m[1])], t: 4 },
    // 2026-09-30 17:18
    { re: new RegExp(String.raw`\b(\d{4})-(\d{2})-(\d{2})${time}`, "g"), parts: (m) => [Number(m[1]), Number(m[2]) - 1, Number(m[3])], t: 4 },
  ];
  for (const p of patterns) {
    let m: RegExpExecArray | null;
    while ((m = p.re.exec(text))) {
      const ymd = p.parts(m);
      if (!ymd || ymd[1] === undefined || Number.isNaN(ymd[1])) continue;
      let h = m[p.t] !== undefined ? Number(m[p.t]) : undefined;
      const mi = m[p.t + 1] !== undefined ? Number(m[p.t + 1]) : 0;
      const ap = m[p.t + 2]?.toLowerCase().replace(/\./g, "");
      if (h !== undefined && ap) {
        if (ap === "pm" && h < 12) h += 12;
        if (ap === "am" && h === 12) h = 0;
      }
      out.push({ at: istToEpoch(ymd[0], ymd[1], ymd[2], h ?? 0, mi), hasTime: h !== undefined, text: m[0].trim() });
    }
  }
  return out;
}

export interface DateMatch {
  ok: boolean;
  seen: ShownDate[];
  how?: "minute" | "day";
}

/** Is the API instant `wantMs` shown in `text`? Minute when a time is shown, else the IST day. */
export function findDate(wantMs: number, text: string): DateMatch {
  const seen = datesIn(text);
  const wantMinute = Math.floor(wantMs / 60_000);
  const istDay = (ms: number) => Math.floor((ms + IST_OFFSET_MIN * 60_000) / 86_400_000);
  for (const s of seen) {
    if (s.hasTime && Math.floor(s.at / 60_000) === wantMinute) return { ok: true, seen, how: "minute" };
  }
  for (const s of seen) {
    if (!s.hasTime && istDay(s.at) === istDay(wantMs)) return { ok: true, seen, how: "day" };
  }
  return { ok: false, seen };
}

/** An instant as a person in India reads it — for evidence lines. */
export function formatIst(ms: number): string {
  return new Date(ms).toLocaleString("en-IN", {
    timeZone: TZ,
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

// ── durations ───────────────────────────────────────────────────────────────
const UNIT_SECONDS: Array<[RegExp, number]> = [
  [/^(s|sec|secs|second|seconds)$/i, 1],
  [/^(m|min|mins|minute|minutes)$/i, 60],
  [/^(h|hr|hrs|hour|hours)$/i, 3600],
  [/^(d|day|days)$/i, 86400],
];

export interface ShownDuration {
  seconds: number;
  /** The smallest unit written, which bounds how exact the display can be. */
  unitSeconds: number;
  text: string;
}

/** "1 hour 30 mins" → 5400 s. Returns null when no duration is written. */
export function durationIn(text: string): ShownDuration | null {
  const re = /(\d+(?:\.\d+)?)\s*([a-z]+)/gi;
  let total = 0;
  let smallest = Infinity;
  let any = false;
  let m: RegExpExecArray | null;
  const parts: string[] = [];
  while ((m = re.exec(text))) {
    const unit = UNIT_SECONDS.find(([r]) => r.test(m![2]));
    if (!unit) continue;
    any = true;
    total += Number(m[1]) * unit[1];
    smallest = Math.min(smallest, unit[1]);
    parts.push(m[0]);
  }
  return any ? { seconds: total, unitSeconds: smallest, text: parts.join(" ") } : null;
}

/** Plain-English duration for evidence: 45 → "45 seconds". */
export function spellDuration(sec: number): string {
  if (sec < 120) return `${Math.round(sec)} second${Math.round(sec) === 1 ? "" : "s"}`;
  if (sec < 7200) return `${Math.round(sec / 60)} minutes`;
  if (sec < 172800) return `${(sec / 3600).toFixed(1).replace(/\.0$/, "")} hours`;
  return `${(sec / 86400).toFixed(1).replace(/\.0$/, "")} days`;
}

/** Money / quantity as a person reads it, for evidence lines: 5301 → "5,301". */
export function spellNumber(n: number, prefix = "", suffix = ""): string {
  const s = n.toLocaleString("en-IN", { maximumFractionDigits: 4 });
  return `${prefix ? prefix + " " : ""}${s}${suffix ? " " + suffix : ""}`.trim();
}
