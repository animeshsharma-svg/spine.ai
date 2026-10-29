import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * DECATHLON (company 57675) ON RUN TESTS.
 *
 * Aanya, 21 Oct: "decath doesnt have intake, pr, events module, so it
 * shouldnt show the modules if decath is selected". Decathlon's console has
 * its own modules (its sidebar: Purchase Order, Invoice, Approvals, GRN, Bill,
 * Accrual, Credit Note, Manage), and its tests are the decath suite's cases
 * (procol-qa-platform/decath/cases.json), each one a browser journey
 * (`decath.<case id>`, uiFlowRunner.ts). So its tree is those modules, in that
 * order, with each case under the module it tests; a module with nothing
 * written yet shows one greyed "No test cases yet" row.
 */
export const DECATHLON_ID = 57675;
const here = dirname(fileURLToPath(import.meta.url));
export const DECATH_DIR = join(here, "..", "..", "..", "decath");

interface DecathCase {
  id: string;
  module: string;
  scenario: string;
  title: string;
  users: number[];
  expected: string;
  writes: boolean;
}

/** Decathlon's sidebar, and which of the sheet's modules each holds. */
const MODULES: Array<{ key: string; n: string; label: string; from: string[] }> = [
  { key: "dc_po", n: "01", label: "Purchase Order", from: ["PO List", "PO Detail", "Edit & Share", "Report Export", "Edge Cases", "Regression"] },
  { key: "dc_invoice", n: "02", label: "Invoice", from: ["PO Picker"] },
  { key: "dc_approvals", n: "03", label: "Approvals", from: ["Approver Access"] },
  { key: "dc_grn", n: "04", label: "GRN", from: [] },
  { key: "dc_bill", n: "05", label: "Bill", from: [] },
  { key: "dc_accrual", n: "06", label: "Accrual", from: [] },
  { key: "dc_credit_note", n: "07", label: "Credit Note", from: [] },
  { key: "dc_manage", n: "08", label: "Manage", from: [] },
];

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

export function decathCases(): DecathCase[] {
  const f = join(DECATH_DIR, "cases.json");
  if (!existsSync(f)) return [];
  return (JSON.parse(readFileSync(f, "utf8")).cases ?? []) as DecathCase[];
}

/** The /api/features answer for Decathlon: its modules as stages, the suite's cases as features. */
export function decathFeatures() {
  const file = join(DECATH_DIR, "cases.json");
  const doc = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : { cases: [], logins: {} };
  const cases: DecathCase[] = doc.cases ?? [];
  const withLogin = new Set<number>(Object.values(doc.logins ?? {}).map(Number));
  const groups: Array<{ id: string; label: string; children: any[] }> = [];
  const stages = MODULES.map((m) => {
    const mods: string[] = [];
    for (const sheetModule of m.from) {
      const kids = cases.filter((c) => c.module === sheetModule);
      if (!kids.length) continue;
      const id = `${m.key}__${slug(sheetModule)}`;
      mods.push(id);
      groups.push({
        id,
        label: sheetModule,
        children: kids.map((c) => {
          const missing = c.users.filter((u) => !withLogin.has(u));
          const tag = missing.length
            ? { tag: "Needs a login", tagWarn: true, tagWhy: `No login yet for user ${missing.join(", ")}: add it to decath/.env, or this case runs as Not tested` }
            : c.writes
              ? { tag: "Changes data", tagWarn: true, tagWhy: "Edits, shares, approves, creates or deletes a PO on UAT — it runs only when writes are allowed (DECATH_ALLOW_WRITES=1)" }
              : {};
          return { id: `decath.${c.id}`, label: `${c.id} · ${c.title}`, what: `${c.scenario}. Expected: ${c.expected}`, cases: 1, uiFlow: `decath.${c.id}`, config: { state: "n/a" }, ...tag };
        }),
      });
    }
    if (!mods.length) {
      const id = `${m.key}__none`;
      mods.push(id);
      groups.push({ id, label: m.label, children: [{ id: `${m.key}.none`, label: "No test cases yet", what: `Nothing written for ${m.label} yet.`, cases: 0, config: { state: "n/a" } }] });
    }
    return { key: m.key, n: m.n, label: m.label, mods };
  });
  return {
    groups,
    defaults: [],
    scope: null,
    totalCases: cases.length,
    company: null,
    suite: { id: "decath", stages, browserOnly: true, ready: true },
  };
}
