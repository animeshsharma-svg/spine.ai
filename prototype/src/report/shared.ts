/**
 * The look both reports share.
 *
 * One stylesheet for the test report and the bug sheet, so the two read as one
 * pair of documents rather than two pages that happen to be in the same app.
 * Self-contained HTML — no bundler, no CDN — so a report can be saved, mailed
 * or attached to a ticket and still render.
 */

export const escapeHtml = (value: unknown): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** Local wall clock, to the minute — reports are read by people, not diffed. */
export function stamp(iso?: string): string {
  const date = iso ? new Date(iso) : new Date();
  if (Number.isNaN(date.getTime())) return String(iso ?? "");
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

export const PAGE_CSS = `
/**
 * One palette, two themes.
 *
 * Tokens rather than hex, so a report follows the reader's system setting
 * instead of blinding whoever works at night — and every colour is defined
 * once, in the light block, and only redefined in the dark one.
 */
:root {
  color-scheme: light dark;
  --paper: #f6f7f8;
  --card: #ffffff;
  --hover: #f8f9fa;
  --line: #dcdfe3;
  --grid: #eceff1;
  --ink: #1f2328;
  --ink-2: #3c4043;
  --muted: #5f6368;
  --code: #eef0f2;
  --good: #1e7a45;
  --bad: #a02020;
  --warn: #8a5a00;
  --link: #1a73e8;
}
@media (prefers-color-scheme: dark) {
  :root {
    --paper: #0f1319;
    --card: #171c24;
    --hover: #1d2430;
    --line: #2a323d;
    --grid: #232a34;
    --ink: #e8ecf1;
    --ink-2: #c7cfd9;
    --muted: #9aa5b1;
    --code: #222932;
    --good: #57c98a;
    --bad: #f2807a;
    --warn: #e5b567;
    --link: #7fb0ff;
  }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--paper); color: var(--ink);
  font: 14px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif; }
.wrap { max-width: 1400px; margin: 0 auto; padding: 24px 20px 72px; }
h1 { font-size: 22px; margin: 0 0 4px; letter-spacing: -.01em; }
.sub { margin: 0 0 18px; color: var(--muted); font-size: 13px; }
.sub code, .lede code { background: var(--code); padding: 1px 5px; border-radius: 4px; font-size: 12px; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 16px 18px; margin: 0 0 18px; }
.card h2 { font-size: 15px; margin: 0 0 12px; }
/* Run-level facts, not defects: kept visually apart from the bug table so
   nothing here reads as engineering work. */
.note-card { border-left: 3px solid var(--warn, #e0a34a); }
.run-notes { margin: 8px 0 0; padding-left: 20px; line-height: 1.6; }
.run-notes li { margin: 4px 0; }
.count { font-size: 12px; color: var(--muted); font-weight: 400; }
.lede { color: var(--muted); font-size: 12.5px; margin: 0 0 14px; line-height: 1.55; }
.lede strong { color: var(--ink-2); }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(116px, 1fr)); gap: 10px; }
.tile { border: 1px solid var(--line); border-radius: 9px; padding: 10px 12px; background: var(--hover); }
.tile-v { font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; }
.tile-l { font-size: 10.5px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }
.tile.crit .tile-v { color: var(--bad); }
.tile.good .tile-v { color: var(--good); }
.tile.warn .tile-v { color: var(--warn); }
/* Verdict chips keep their own colours in both themes: they are the one thing
   a reader matches across the report, the sheet and the spreadsheet. */
.pill { display: inline-block; border-radius: 999px; padding: 2px 10px; font-size: 11px; font-weight: 700; white-space: nowrap; }
.p-pass { background: #d9ead3; color: #1e5c2a; }
.p-fail { background: #a02020; color: #fff; }
.p-incon { background: #fce8b2; color: #5c4404; }
.p-notrun { background: #e4e7ea; color: #4a4f55; }
.p-muted { background: #e4e7ea; color: #4a4f55; }
.filters { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin: 0 0 14px; }
.filters input, .filters select, .filters button { font: inherit; font-size: 13px; padding: 5px 8px;
  border: 1px solid var(--line); border-radius: 6px; background: var(--card); color: var(--ink); }
.filters input { min-width: 230px; }
.filters button { cursor: pointer; }
.hidden { display: none !important; }
code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
pre { background: var(--code); border: 1px solid var(--line); border-radius: 7px; padding: 10px 12px;
  overflow-x: auto; font-size: 11.5px; line-height: 1.5; margin: 0; white-space: pre; color: var(--ink-2); }
a { color: var(--link); }
.none { color: var(--muted); font-size: 12.5px; margin: 6px 0; }
`;
