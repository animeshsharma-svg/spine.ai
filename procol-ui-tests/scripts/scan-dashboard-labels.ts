/**
 * EVERY STRING THE PRODUCT RENDERS, READ FROM ITS SOURCE — so a real label is never called a guess.
 *
 *   npx tsx scripts/scan-dashboard-labels.ts [--ref origin/fe-main-uat-test]
 *
 * knownLabels.json was collected by hand for a dozen screens (569 strings, 3 Oct). The compiler's honesty
 * guard (prototype planner.ts labelGuesses) called every other label a guess — "Ok", "Reject Bid",
 * "Increase Event Time", "Withdrawal Remarks" — and marked 145 sourcing cases partial for it (12 Nov census).
 * This reads procol-client-dashboard (READ-ONLY: git ls-tree / git show at a ref, nothing checked out or
 * written there) and keeps the strings the product puts on screen: JSX text, the UI props (title, label,
 * placeholder, okText, cancelText, tooltip, header, tab …) and message/notification/toast texts.
 *
 * Output: src/plan/generic/sourceLabels.json — {ref, commit, collectedAt, labels: [{text, files}]}.
 * dump-plan-catalog.ts publishes the texts as `sourceLabels`; the guard accepts them on an EXACT match only
 * (the prompt's KNOWN LABELS stay the curated per-screen list — thousands of strings would drown it).
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const REPO = join(here, "..", "..", "..", "procol", "procol-client-dashboard");
const repo = process.env.DASHBOARD_REPO ?? (REPO.includes("procol-gap-wt") ? join(here, "..", "..", "procol-client-dashboard") : REPO);
const ref = process.argv.includes("--ref") ? process.argv[process.argv.indexOf("--ref") + 1] : "origin/fe-main-uat-test";
const git = (...a: string[]) => execFileSync("git", ["-C", repo, ...a], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });

const commit = git("rev-parse", "--short", ref).trim();
const files = git("ls-tree", "-r", "--name-only", ref, "--", "src")
  .split("\n")
  .filter((f) => /\.(jsx?|tsx?)$/.test(f) && !/(\.test\.|\.spec\.|__tests__|\.stories\.|\/mocks?\/)/.test(f));

const PROPS = "title|label|placeholder|okText|cancelText|tooltip|tooltipTitle|header|tab|buttonText|btnText|text|description|message|emptyText|content|heading|subTitle|subtitle|confirmText|helperText|addonBefore|addonAfter|extra|alt|name";
const RX: RegExp[] = [
  // JSX text between tags: >Reject Bid<
  />\s*([A-Za-z₹][^<>{}\n]{0,80}?)\s*</g,
  // props with a plain string: title="Increase Event Time"
  new RegExp(`\\b(?:${PROPS})\\s*=\\s*["']([^"'{}\\n]{1,100})["']`, "g"),
  // props with a braced string: okText={'Ok'}
  new RegExp(`\\b(?:${PROPS})\\s*=\\s*\\{\\s*["'\`]([^"'\`$\\n]{1,100})["'\`]\\s*\\}`, "g"),
  // object keys that carry UI text: { title: 'Withdraw Event' }
  new RegExp(`\\b(?:${PROPS})\\s*:\\s*["'\`]([^"'\`$\\n]{1,100})["'\`]`, "g"),
  // toasts and notifications: message.success('Sealed Bid time extended!')
  /\b(?:message|notification|toast|showToast|showMessage|openNotification|notify)(?:\.\w+)?\(\s*["'`]([^"'`$\n]{2,140})["'`]/g,
  // a fallback text: {okText || "Ok"}
  /\|\|\s*["'`]([^"'`$\n]{1,80})["'`]/g,
  // a text kept in a variable first: let successMsg = "Form submission time extended"
  /\b\w*(?:Msg|Message|Text|Title|Label|Tooltip|Heading)\s*=\s*["'`]([^"'`$\n]{2,140})["'`]/g,
];

/** Strings that are code, not UI text. */
function isUiText(s: string): boolean {
  const t = s.trim();
  if (t.length < 2 || t.length > 140) return false;
  if (!/[A-Za-z]/.test(t)) return /^[₹$€£]/.test(t);
  if (/^[a-z]+[A-Z]\w*$/.test(t) || /^[a-z_]+$/.test(t) && t.includes("_")) return false; // camelCase / snake_case identifiers
  if (/^(https?:|\/|\.|#|data:|mailto:)/.test(t)) return false;
  if (/[=;{}]|=>|\b(function|return|const|let|var|import|export|props|state)\b/.test(t)) return false;
  if (/^[\w-]+(\s+[\w-]+:[\w-]+)+$/.test(t) || /^(flex|grid|text|bg|p|m|w|h)-/.test(t)) return false; // class lists
  if (/^[a-z-]+$/.test(t) && t.includes("-")) return false; // kebab ids / class names
  if (/^(true|false|null|undefined|primary|secondary|default|small|large|middle|left|right|center|top|bottom|button|submit|text|number|string|object)$/i.test(t)) return false;
  return true;
}

const found = new Map<string, Set<string>>();
const keep = (raw: string, f: string) => {
  const t = raw.replace(/\s+/g, " ").trim();
  if (!isUiText(t)) return;
  const s = found.get(t) ?? new Set<string>();
  if (s.size < 3) s.add(f.replace(/^src\//, ""));
  found.set(t, s);
};
// the English translation files: every text the i18n layer renders ("increaseAuctionTimeModalTitle": "Increase Event Time")
for (const f of git("ls-tree", "-r", "--name-only", ref, "--", "src").split("\n").filter((x) => /(translations|locales?|i18n)\/(en[\w-]*)(\/[\w.-]+)?\.json$|\/en\.json$/i.test(x))) {
  const walk = (v: unknown): void => {
    if (typeof v === "string") keep(v.replace(/\{\{?\s*\w+\s*\}?\}/g, "").trim() || v, f);
    else if (v && typeof v === "object") for (const x of Object.values(v)) walk(x);
  };
  try {
    walk(JSON.parse(git("show", `${ref}:${f}`)));
  } catch {
    /* not JSON */
  }
}
let n = 0;
for (const f of files) {
  let src = "";
  try {
    src = git("show", `${ref}:${f}`);
  } catch {
    continue;
  }
  n++;
  for (const rx of RX)
    for (const m of src.matchAll(rx)) keep(m[1], f);
}

const out = join(here, "..", "src", "plan", "generic", "sourceLabels.json");
const labels = [...found.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([text, fs]) => ({ text, files: [...fs] }));
writeFileSync(out, JSON.stringify({ source: "procol-client-dashboard (read-only)", ref, commit, collectedAt: new Date().toISOString(), files: n, labels }, null, 1));
console.log(`read ${n} files at ${ref} (${commit}) — ${labels.length} UI strings → ${out}`);
