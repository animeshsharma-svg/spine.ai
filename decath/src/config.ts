import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Decathlon UAT, as the suite sees it.
 *
 * Logins come from decath/.env (one phone per role, and the UAT sign-in code),
 * never from this file. Procol's database (read-only, for what each PO really
 * is: whose, shared with whom, a draft or not) is the DATABASE_URL in
 * `procol test/.env`, the same one the other suites use.
 */
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function readEnv(file: string): Record<string, string> {
  if (!existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

const own = readEnv(join(ROOT, ".env"));
const env = (k: string): string => process.env[k] ?? own[k] ?? "";

export const BASE = env("DECATH_BASE") || "https://cpanel.ag-ri.in";
export const OTP = env("DECATH_OTP");
export const COMPANY_ID = 57675;
/** The PO list, and the record type every PO is (flexi datasource 10056). */
export const PO_LIST_PATH = "/purchase-order-flexi";
export const PO_DATASOURCE_UUID = "UWdrWlo=";

/** Who each login is on UAT (looked up by phone, 21 Oct 2026). */
export const ROLES = {
  general_user: { userId: 23170, words: "general user (23170)" },
  business_validator: { userId: 23151, words: "business validator (23151)" },
  account_validator: { userId: 23172, words: "account validator (23172)" },
  av_leader: { userId: 23742, words: "account validator leader (23742)" },
  finance_partner: { userId: 23744, words: "finance partner (23744)" },
  real_estate: { userId: 23743, words: "real estate (23743)" },
  super_admin: { userId: 21543, words: "super admin (21543)" },
  // Added 22 Oct. The "bv3" phone Aanya sent signs in as Business Validator 3 (24496, ten teams),
  // not as 24500 ("bv3", one team: CC-1010801041), the user RBV_002 and RBV_006 name.
  account_validator_2: { userId: 24295, words: "account validator 2 (24295)" },
  business_validator_3: { userId: 24496, words: "business validator 3 (24496)" },
  approver: { userId: 21710, words: "approver Suma VA (21710)" },
  general_user_3: { userId: 23171, words: "general user 3 (23171)" },
} as const;
export type Role = keyof typeof ROLES;

export const phoneOf = (role: Role): string => env(`DECATH_PHONE_${role.toUpperCase()}`);
/** A user a case names that has no login in .env yet. */
export const roleOfUser = (userId: number): Role | null =>
  (Object.entries(ROLES).find(([, v]) => v.userId === userId)?.[0] as Role | undefined) ?? null;

export const HEADED = env("DECATH_HEADED") === "1";
export const ALLOW_WRITES = env("DECATH_ALLOW_WRITES") === "1";
/** The dashboard's run id (QA_RUN_ID), or one of our own. */
export const RUN_ID = (process.env.QA_RUN_ID || `decath-${Date.now().toString(36)}`).replace(/[^\w.-]+/g, "_");
/** Pictures go where the dashboard serves them (/api/ui-evidence reads procol-ui-tests/evidence). */
export const EVIDENCE = join(ROOT, "..", "procol-ui-tests", "evidence", RUN_ID);

export function databaseUrl(): string {
  const f = join(ROOT, "..", "procol test", ".env");
  return process.env.DATABASE_URL || readEnv(f).DATABASE_URL || "";
}

export interface Case {
  id: string;
  module: string;
  scenario: string;
  title: string;
  users: number[];
  steps: string[];
  data: string;
  expected: string;
  writes: boolean;
  /** Aanya's own result from the sheet, shown beside the automated one. */
  tester?: { result: string; comment?: string };
  /** A product rule Aanya gave that changed the sheet's wording (the original is in `sheet`). */
  rule?: string;
  sheet?: { title?: string; steps?: string[]; expected?: string };
}
export const CASES: Case[] = JSON.parse(readFileSync(join(ROOT, "cases.json"), "utf8")).cases;
/** DECATH_CASES=RBV_002,RBV_006 runs just those (the dashboard passes the ticked ones). */
export const PICKED = (process.env.DECATH_CASES ?? "").split(",").map((s) => s.trim()).filter(Boolean);
