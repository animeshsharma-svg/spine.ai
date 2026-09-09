/**
 * DATA-VALIDATION RUNNER — the "try to break the inputs" muscle.
 *
 * It creates a user with a range of phone values and records EXACTLY what the
 * backend does (accept / reject + message). It doesn't assume the outcome — it
 * reports the real behaviour, then flags where that behaviour disagrees with
 * the PRD's claim ("accept any 10-digit number").
 *
 * THE REAL DEFECT (mapped live against UAT): the backend validates phone LENGTH
 * (rejects 9 or 11 digits with 422 "Invalid phone number") but NOT that the
 * characters are digits — a 10-character value containing LETTERS (e.g.
 * "9876543ABC") is accepted (HTTP 200). The frontend form enforces digits-only
 * (validateCountryPhone, utils/index.js:195-203), so the API is more lenient
 * than the UI and lets a malformed phone into the users table.
 *
 * Footprint: only VALID inputs create a record; invalid ones are rejected with
 * no record. All test users carry the QA_Platform_ prefix.
 */
import type { ValidationCaseResult } from "../ai/types.js";

const PREFIX = "+91";

interface Variant {
  label: string;
  phone: string;
  phonePrefix: string;
  // What SHOULD happen if a phone is "exactly 10 digits, prefix +91".
  expectedPerPrd: "accept" | "reject";
}

/** unique 8-digit suffix so we never collide with an existing user/vendor */
const uniq8 = () => String(Date.now() % 100_000_000).padStart(8, "0");

/** The phone values we throw at the field. */
function variants(): Variant[] {
  return [
    {
      label: "Valid 10-digit mobile (98xxxxxxxx)",
      phone: `98${uniq8()}`,
      phonePrefix: PREFIX,
      expectedPerPrd: "accept", // 10 digits → should be accepted
    },
    {
      label: "10 characters but contains LETTERS (7 digits + ABC)",
      phone: `${uniq8().slice(0, 7)}ABC`,
      phonePrefix: PREFIX,
      expectedPerPrd: "reject", // a phone must be digits → SHOULD be rejected
    },
    {
      label: "11 digits (one too many)",
      phone: `9${uniq8()}12`,
      phonePrefix: PREFIX,
      expectedPerPrd: "reject", // not 10 digits → correct to reject
    },
    {
      label: "9 digits (one too few)",
      phone: `9${uniq8()}`,
      phonePrefix: PREFIX,
      expectedPerPrd: "reject", // not 10 digits → correct to reject
    },
  ];
}

/** Create one user with the given phone; capture accept/reject faithfully. */
async function tryOne(api: any, teamUuid: string | undefined, v: Variant): Promise<ValidationCaseResult> {
  const s = Date.now();
  const body: any = {
    name: `QA_Platform_User_${s}`,
    email: `qa_platform_${s}@example.com`,
    phone: v.phone,
    phone_prefix: v.phonePrefix,
    role: "member",
    ...(teamUuid ? { teams: [{ uuid: teamUuid, role: "member" }] } : {}),
  };
  try {
    await api.post("/users/create_user", { body });
    return {
      label: v.label,
      input: { phone: v.phone, phone_prefix: v.phonePrefix },
      httpStatus: 200,
      accepted: true,
      message: null,
      expectedPerPrd: v.expectedPerPrd,
      mismatch: v.expectedPerPrd === "reject",
    };
  } catch (err: any) {
    const status = typeof err?.status === "number" ? err.status : null;
    const message = err?.message ?? String(err);
    return {
      label: v.label,
      input: { phone: v.phone, phone_prefix: v.phonePrefix },
      httpStatus: status,
      accepted: false,
      message,
      expectedPerPrd: v.expectedPerPrd,
      mismatch: v.expectedPerPrd === "accept",
    };
  }
}

/**
 * Run the phone-field validation probe. Creates a team to attach the (valid)
 * user to, then walks the phone variants.
 */
export async function runPhoneValidation(api: any): Promise<ValidationCaseResult[]> {
  let teamUuid: string | undefined;
  try {
    const team: any = await api.post("/teams", {
      body: { name: `QA_Platform_Team_${Date.now()}`, team_type: "purchase" },
    });
    teamUuid = team?.uuid ?? team?.data?.uuid ?? team?.id;
  } catch {
    teamUuid = undefined; // team is a nicety; user-create still works without it
  }

  const results: ValidationCaseResult[] = [];
  for (const v of variants()) {
    results.push(await tryOne(api, teamUuid, v));
  }
  return results;
}
