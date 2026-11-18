import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The QA identities spine.ai created for a company (prototype/src/checks/qaIdentities.ts → prototype/data/
 * qa-identities.json): the other people a case needs — approvers, a collaborator, the new owner, a view-only user.
 * Each is a QA test user (qa_…@example.com) with the persona names the case sheet gives them. Read only here; the
 * `act_as` step signs one in (18 Nov 2026, In-Principle Approval on Amity University).
 */
export interface QaIdentity {
  companyId: number;
  key: string;
  plays: string[];
  userId: number;
  email: string;
  name: string;
  status: string;
}

const FILE = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "prototype", "data", "qa-identities.json");
const norm = (s: string) => s.toLowerCase().replace(/\([^)]*\)/g, " ").replace(/[^a-z0-9]+/g, " ").replace(/\b(the|a|an)\b/g, " ").replace(/\s+/g, " ").trim();

export function identities(companyId: number): QaIdentity[] {
  if (!existsSync(FILE)) return [];
  try {
    return (JSON.parse(readFileSync(FILE, "utf8")) as QaIdentity[]).filter((i) => i.companyId === companyId);
  } catch {
    return [];
  }
}

/** The identity the case's words name ("Approver A", "Anita Rao (CFO)", "the view-only user"), if any. */
export function identityFor(companyId: number, words: string): QaIdentity | undefined {
  const w = norm(words);
  if (!w) return undefined;
  const ids = identities(companyId);
  const names = (i: QaIdentity) => [i.key.replace(/_/g, " "), ...i.plays].map(norm);
  return ids.find((i) => names(i).includes(w)) ?? ids.find((i) => names(i).some((p) => p.length >= 4 && (w.includes(p) || p.includes(w))));
}
