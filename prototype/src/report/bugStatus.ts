/**
 * THE BUG SHEET'S VOCABULARY — statuses, priorities and colours.
 *
 * Taken from the team's own sheet, values and colours both, because the whole
 * point of this page is that a row can move between the two without being
 * re-keyed or re-coloured. If the sheet gains a status, add it here and both
 * the dropdown and the chip follow.
 */

export const BUG_STATUSES = [
  "FIXED",
  "OPEN",
  "TO BE TESTED",
  "TO BE DEPLOYED",
  "TO BE PICKED",
  "TO DO",
  "TO BE DISCUSSED",
  "NOT A BUG",
  "FIX LATER",
  "Duplicate Issue",
  "Feature Bug/ Enhancement",
  "Re-open",
] as const;

export type BugStatus = (typeof BUG_STATUSES)[number];

/** status → [background, text] exactly as the sheet paints them. */
export const STATUS_COLOR: Record<string, [string, string]> = {
  FIXED: ["#38761d", "#ffffff"],
  OPEN: ["#a02020", "#ffffff"],
  "TO BE TESTED": ["#cfe2f3", "#0b4f6c"],
  "TO BE DEPLOYED": ["#d0e0e3", "#134f5c"],
  "TO BE PICKED": ["#f4c7c3", "#5c1a16"],
  "TO DO": ["#1155cc", "#ffffff"],
  "TO BE DISCUSSED": ["#fce8b2", "#5c4404"],
  "NOT A BUG": ["#efefef", "#5f6368"],
  "FIX LATER": ["#d9d2e9", "#3d2c66"],
  "Duplicate Issue": ["#990000", "#ffffff"],
  "Feature Bug/ Enhancement": ["#674ea7", "#ffffff"],
  "Re-open": ["#7f4f10", "#ffffff"],
};

export const PRIORITIES = ["P0", "P1", "P2", "P3"] as const;

export const PRIORITY_COLOR: Record<string, [string, string]> = {
  P0: ["#a02020", "#ffffff"],
  P1: ["#f4c7c3", "#5c1a16"],
  P2: ["#fff2cc", "#5c4404"],
  P3: ["#efefef", "#5f6368"],
};

/**
 * Who has to do the work. BE/FE are engineering; the rest keep our own
 * problems out of their queue — a harness bug filed as a product bug is how a
 * QA tool loses its audience.
 */
export const DEV_TYPES = ["BE", "FE", "BOTH", "CONFIG", "DATA", "HARNESS", "ENV", "TEST"] as const;

export const DEV_TYPE_COLOR: Record<string, [string, string]> = {
  BE: ["#a61c00", "#ffffff"],
  FE: ["#b45f06", "#ffffff"],
  BOTH: ["#85200c", "#ffffff"],
  CONFIG: ["#7f6000", "#ffffff"],
  DATA: ["#0c5460", "#ffffff"],
  HARNESS: ["#7f4f10", "#ffffff"],
  ENV: ["#4a86e8", "#ffffff"],
  TEST: ["#cfe2f3", "#163b5c"],
};

/** Inline style for a chip, so a colour never depends on a class existing. */
export function chipStyle(map: Record<string, [string, string]>, value: string): string {
  const [bg, fg] = map[value] ?? ["#efefef", "#5f6368"];
  return `background:${bg};color:${fg}`;
}

/** The CSS both sheets use for their editable cells. */
export const EDITABLE_CSS = `
.cell-select { appearance: none; border: 0; border-radius: 999px; padding: 3px 22px 3px 12px; cursor: pointer;
  font: 700 11px Arial, sans-serif; white-space: nowrap; text-align: left;
  background-image: linear-gradient(45deg, transparent 50%, currentColor 50%), linear-gradient(135deg, currentColor 50%, transparent 50%);
  background-position: right 10px center, right 6px center; background-size: 4px 4px, 4px 4px; background-repeat: no-repeat; }
.cell-select:focus-visible { outline: 2px solid #1a73e8; outline-offset: 1px; }
.cell-select option { background: #fff; color: #202124; font-weight: 600; }
.cell-input, .cell-text { width: 100%; border: 0; background: transparent; font: inherit; color: inherit;
  padding: 2px 3px; border-radius: 4px; resize: vertical; }
.cell-input:hover, .cell-text:hover { background: #f1f3f4; }
.cell-input:focus, .cell-text:focus { outline: 2px solid #1a73e8; outline-offset: 0; background: #fff; }
.cell-text { min-height: 34px; line-height: 1.45; font-size: 11.5px; }
tr.saving td { box-shadow: inset 3px 0 0 #f9ab00; }
tr.saved td { box-shadow: inset 3px 0 0 #1e7a45; }
tr.savefail td { box-shadow: inset 3px 0 0 #a02020; }
.save-note { font-size: 11.5px; color: #5f6368; margin: 0 0 10px; }
.save-note b { color: #1e7a45; }
`;
