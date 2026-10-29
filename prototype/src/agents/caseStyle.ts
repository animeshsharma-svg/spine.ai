/**
 * THE HOUSE STYLE FOR TEST CASES — one shape and one voice for every case the platform writes.
 *
 * The team's manual sheets (the PO Amendment sheet, docs/test-cases/Procol-Sourcing-Test-Cases-PR-to-PO.xlsx)
 * use 13 columns and a plain voice: a tester who has never seen Procol can follow every line, each click
 * is named as it reads on screen, and the expected result quotes the app's own message. Every generator
 * (journey cases, screen cases, the explorer, API plans) writes in this style so its output can sit in the
 * same sheet and be run by the same sheet runner.
 */

export const SHEET_COLUMNS = ["Test Case ID", "Module", "Scenario", "Test Case Title", "User Role", "Portal", "Pre-conditions", "Configs Needed", "Test Data", "Test Steps", "Expected Result", "Priority", "Test Type", "Status"] as const;
export type SheetColumn = (typeof SHEET_COLUMNS)[number];
export type SheetRow = Record<SheetColumn, string>;

export const BUYER_LOGIN = "Log in to Procol (buyer side) with the buyer user";
export const VENDOR_LOGIN = "Log in to the Procol vendor portal with the vendor's user (use a second browser or an incognito window so the buyer stays logged in)";

/** What every model that writes a test case is told — the voice, not the subject. */
export const STYLE_GUIDE = [
  "WRITE EVERY TEST CASE IN THE TEAM'S HOUSE STYLE (the manual sheets testers already use):",
  "- Plain English a new tester understands in one read. No code words: say \"the Publish button\", not publish_event; \"the vendor's bid\", not bid_uuid.",
  "- Title: what is checked, as a short sentence (\"Reject Bid is disabled while bidding is on\"), never a command to the machine.",
  "- Steps: numbered actions a person does, one action per step, naming each button, tab, field and menu exactly as it reads on screen, in quotes (click \"Master QCS\", then \"Start Awarding\"). Start with the login: \"" + BUYER_LOGIN + "\" (or the vendor login for vendor steps). Say where to click when it is not obvious (\"the three dots (⋮) at the top right of the project page\").",
  "- Expected result: what the person sees on screen, specific enough to mark pass or fail at a glance — the status badge, the counts, the totals worked out (6 × 90 = 540), and the app's own message in quotes when the app refuses. Never \"works correctly\" or \"as expected\".",
  "- Pre-conditions: the state the case starts from in words (\"a closed RFQ where Vendor A quoted 100 and Vendor B quoted 90\"), and any company setting it needs.",
  "- Configs needed: every company setting the case depends on, one per line as `setting_key = On|Off|value — what it does` (e.g. `rfx_project_enabled = Off — eRFX projects`), taken from Procol's company settings; \"None\" when the case works on any setup. The runner switches exactly these before the case and back after it, so name a setting even when the test company already has it that way. A feature worth testing both ways gets two cases: one with the setting On, one with it Off.",
  "- Test data: the exact values to type (product, quantity, price, dates).",
  "- Vendors: only the QA test vendors (Vendor A, B, C — names start with QA_Platform). A case that names a vendor adds it by search; a case that names none uses \"Invite Vendor\" (everyone mapped to the product).",
  "- Where the product has not settled a rule, write \"Record what happens\" instead of guessing the result.",
  "- Priority is Critical, High, Medium or Low; Test Type is Positive, Negative (the app should refuse) or Edge.",
].join("\n");

/** Two cases from the team's sheet, as the model's examples of the voice. */
export const STYLE_EXAMPLES = [
  {
    title: "Reject Bid is disabled while bidding is on",
    role: "Buyer",
    portal: "Buyer portal",
    preconditions: "A live RFQ where Vendor A quoted 100 and Vendor B quoted 90.",
    configs: "None",
    testData: "-",
    steps: [BUYER_LOGIN, "From the left menu click \"Events\" and open the live RFQ", "Open the RFQ stage's \"Responses\" tab", "Move the mouse over \"Reject Bid\" on Vendor A's bid"],
    expected: "\"Reject Bid\" is greyed out with the tooltip \"Disabled during Bidding time.\"",
    priority: "Critical",
    testType: "Negative",
  },
  {
    title: "Two bids: award a split, 6 units to B and 4 units to A, with no approval flow",
    role: "Buyer",
    portal: "Buyer portal",
    preconditions: "A closed RFQ for 10 units where Vendor A quoted 100 and Vendor B quoted 90.",
    configs: "is_partial_awarding_enabled = On — splitting a line's quantity across vendors",
    testData: "Split 6 + 4",
    steps: [BUYER_LOGIN, "Open the closed RFQ", "Click \"Master QCS\" and then \"Start Awarding\"", "Type 6 against Vendor B and 4 against Vendor A", "Click \"Create Proposal\", fill the required fields and click \"Submit Proposal\""],
    expected: "The proposal shows Vendor B 6 × 90 = 540 and Vendor A 4 × 100 = 400, total 940. The award is final at once: one PO per vendor is created and the event moves to History.",
    priority: "High",
    testType: "Positive",
  },
];

export function styleExamplesText(): string {
  return STYLE_EXAMPLES.map((e, i) => `EXAMPLE ${i + 1}\nTitle: ${e.title}\nUser role: ${e.role} · Portal: ${e.portal}\nPre-conditions: ${e.preconditions}\nConfigs needed: ${e.configs}\nTest data: ${e.testData}\nSteps:\n${e.steps.map((s, k) => `${k + 1}. ${s}`).join("\n")}\nExpected result: ${e.expected}\nPriority: ${e.priority} · Test type: ${e.testType}`).join("\n\n");
}

const REFUSAL = /\b(refus|reject|cannot|can't|not allowed|blocked|disabled|greyed|invalid|not offered|error message|is required)/i;

/** A drafted case brought into the house shape: login first, numbered steps stripped, role/portal/type filled. */
export function toHouseStyle(c: { title: string; steps: string[]; expected: string; setup?: string; testData?: string; priority?: string; role?: string; portal?: string; testType?: string }): {
  title: string; steps: string[]; expected: string; preconditions: string; testData: string; role: string; portal: string; priority: string; testType: string;
} {
  const steps = (c.steps ?? []).map((s) => String(s).replace(/^\s*\d+[.)]\s*/, "").trim().replace(/\.$/, "")).filter(Boolean);
  const vendor = steps.some((s) => /vendor portal|as (the )?vendor\b|vendor's user/i.test(s));
  const buyer = steps.some((s) => !/vendor portal|vendor's user/i.test(s));
  if (steps.length && !/^log in/i.test(steps[0])) steps.unshift(vendor && !buyer ? VENDOR_LOGIN : BUYER_LOGIN);
  const P = { P0: "Critical", P1: "High", P2: "Medium", P3: "Low", critical: "Critical", high: "High", medium: "Medium", low: "Low" } as Record<string, string>;
  const testType = c.testType && /^(positive|negative|edge)$/i.test(c.testType) ? c.testType[0].toUpperCase() + c.testType.slice(1).toLowerCase() : REFUSAL.test(`${c.title} ${c.expected}`) ? "Negative" : "Positive";
  return {
    title: String(c.title ?? "").trim().replace(/\.$/, ""),
    steps,
    expected: String(c.expected ?? "").trim(),
    preconditions: String(c.setup ?? "").trim() || "-",
    testData: String(c.testData ?? "").trim() || "-",
    role: c.role || (vendor && buyer ? "Buyer, Vendor" : vendor ? "Vendor" : "Buyer"),
    portal: c.portal || (vendor && buyer ? "Buyer + Vendor portal" : vendor ? "Vendor portal" : "Buyer portal"),
    priority: P[String(c.priority ?? "").trim()] ?? (String(c.priority ?? "").trim() || "Medium"),
    testType,
  };
}

export interface ConfigNeed { key: string; value: unknown; why?: string }
const shownValue = (v: unknown) => (v === true ? "On" : v === false ? "Off" : typeof v === "string" ? v : JSON.stringify(v));
/** The "Configs Needed" cell: one `key = On|Off|value — what it does` per line, or "None". */
export function formatConfigs(list: ConfigNeed[] | null | undefined): string {
  return list?.length ? list.map((c) => `${c.key} = ${shownValue(c.value)}${c.why ? ` — ${c.why}` : ""}`).join("\n") : "None";
}
/** Read a "Configs Needed" cell back into settings. "None", "-" or empty → []. */
export function parseConfigs(cell: string | null | undefined): ConfigNeed[] {
  const out: ConfigNeed[] = [];
  for (const part of String(cell ?? "").split(/\n|;/)) {
    const m = part.trim().match(/^([a-z][a-z0-9_]*)\s*[=:]\s*(.+?)\s*(?:[—–]\s*(.*))?$/);
    if (!m) continue;
    const raw = m[2].trim();
    let value: unknown = raw;
    if (/^(on|yes|true|enabled?)$/i.test(raw)) value = true;
    else if (/^(off|no|false|disabled?)$/i.test(raw)) value = false;
    else if (/^-?\d+(\.\d+)?$/.test(raw)) value = Number(raw);
    else if (/^[[{"]|^null$/.test(raw)) {
      try {
        value = JSON.parse(raw);
      } catch {
        /* keep the text */
      }
    }
    out.push({ key: m[1], value, why: m[3]?.trim() || undefined });
  }
  return out;
}

/** One case as a sheet row (the house columns). */
export function toSheetRow(id: string, module: string, scenario: string, c: Parameters<typeof toHouseStyle>[0] & { configs?: ConfigNeed[] }, status = "Not Run"): SheetRow {
  const h = toHouseStyle(c);
  return {
    "Test Case ID": id, Module: module, Scenario: scenario, "Test Case Title": h.title, "User Role": h.role, Portal: h.portal,
    "Pre-conditions": h.preconditions, "Configs Needed": formatConfigs(c.configs), "Test Data": h.testData, "Test Steps": h.steps.map((s, i) => `${i + 1}. ${s}`).join("\n"),
    "Expected Result": h.expected, Priority: h.priority, "Test Type": h.testType, Status: status,
  };
}
