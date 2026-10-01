import type { ScreenSnapshot, Segment } from "./screenText.js";
import { findText, normText } from "./normalize.js";

/**
 * WHERE ON THE SCREEN — geometric scopes over a snapshot.
 *
 * The console's grids are split into frozen and scrolling panes, so one visual
 * row is several DOM elements; a "line" is therefore every segment drawn at
 * the same height as an anchor. A label's value is what sits right of it on
 * the same line, or just below it ("Created at" over "30 September 2026").
 */

const textual = (s: Segment) => (s.kind === "text" || s.kind === "title") && !s.overlay;

export function lineText(segs: Segment[]): string {
  return [...segs].sort((a, b) => a.box.x - b.box.x).map((s) => s.text).join(" ");
}

/** Every segment drawn on the same visual line as `seg`. */
export function lineOf(snap: ScreenSnapshot, seg: Segment): Segment[] {
  const top = seg.box.y;
  const bottom = seg.box.y + Math.max(seg.box.h, 1);
  return snap.segments.filter((s) => {
    if (s.overlay || (!textual(s) && s.kind !== "value")) return false;
    const c = s.box.y + s.box.h / 2;
    const overlap = Math.min(bottom, s.box.y + s.box.h) - Math.max(top, s.box.y);
    return (c >= top - 2 && c <= bottom + 2) || overlap >= Math.min(seg.box.h, s.box.h) * 0.6;
  });
}

/** Segments that show the anchor text (exact first, then contained, then truncated). */
export function anchorsFor(snap: ScreenSnapshot, anchor: string): Segment[] {
  const exact = snap.segments.filter((s) => textual(s) && normText(s.text) === normText(anchor));
  if (exact.length) return exact.slice(0, 12);
  return snap.segments.filter((s) => textual(s) && findText(anchor, [s.text]).ok).slice(0, 12);
}

/** Segments that ARE a label (trailing "*" and ":" ignored). */
export function labelSegments(snap: ScreenSnapshot, label: string): Segment[] {
  const want = normText(label).replace(/\*$/, "").trim();
  return snap.segments.filter((s) => textual(s) && normText(s.text).replace(/\*$/, "").trim() === want);
}

/** The value region of a label: right of it on its line, or directly below it. */
export function besideLabel(snap: ScreenSnapshot, label: Segment): Segment[] {
  const L = label.box;
  const right = lineOf(snap, label).filter((s) => s !== label && s.box.x >= L.x + L.w - 4 && s.box.x - (L.x + L.w) < 360);
  const below = snap.segments.filter(
    (s) =>
      s !== label &&
      !s.overlay &&
      (textual(s) || s.kind === "value") &&
      s.box.y >= L.y + L.h - 3 &&
      s.box.y <= L.y + L.h + 48 &&
      Math.abs(s.box.x - L.x) < 60,
  );
  // A stacked layout (label over value) puts the NEXT label to the right, so
  // when something sits directly below the label, that is the value.
  if (below.length) return below.sort((a, b) => a.box.y - b.box.y).slice(0, 4);
  return right.sort((a, b) => a.box.x - b.box.x).slice(0, 4);
}

/** The cell on `line` under the header `header` (x-ranges overlap). */
export function underHeader(line: Segment[], header: Segment): Segment[] {
  const H = header.box;
  return line.filter((s) => {
    const overlap = Math.min(H.x + H.w, s.box.x + s.box.w) - Math.max(H.x, s.box.x);
    return overlap > Math.min(8, s.box.w / 2) && s !== header;
  });
}

/** The header for a column, nearest above the line. */
export function headerAbove(snap: ScreenSnapshot, label: string, lineY: number, xRange?: [number, number]): Segment | null {
  const cands = labelSegments(snap, label).filter((h) => h.box.y < lineY - 2);
  const inRange = xRange ? cands.filter((h) => h.box.x + h.box.w / 2 >= xRange[0] && h.box.x + h.box.w / 2 < xRange[1]) : cands;
  const pool = inRange.length ? inRange : xRange ? [] : cands;
  pool.sort((a, b) => b.box.y - a.box.y);
  return pool[0] ?? null;
}

/** A short excerpt of what a scope shows, for evidence lines. */
export function excerpt(text: string, max = 160): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1) + "…" : t || "(nothing)";
}
