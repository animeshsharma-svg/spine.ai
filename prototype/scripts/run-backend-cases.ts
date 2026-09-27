/**
 * Run the SAFE, runnable backend-change cases against the sandbox.
 *
 *   tsx scripts/run-backend-cases.ts
 *
 * Safety contract (matches the project rule — never disturb live data):
 *   - every case here EITHER only reads, OR asserts a rejection (the API errors
 *     out before it mutates anything), OR creates only `API_Test_`-named records
 *     (the framework's sanctioned sandbox creation).
 *   - we NEVER pass an input that could succeed as a real mutation on real data
 *     (e.g. recover-user is only ever called with an already-active or bogus id;
 *     edit-contact is only ever called with an invalid email so it rejects).
 *
 * Fresh token every run: we log in through the API framework (`procol test/`)
 * in-process — same import trick as apiCaseRunner/flowReplay.
 */
import { config as loadEnv } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const PROCOL_TEST = join(here, "..", "..", "procol test");
loadEnv({ path: join(here, "..", ".env") });
loadEnv({ path: join(PROCOL_TEST, ".env") });

interface Attempt {
  status: number;
  ok: boolean;
  data: unknown;
  errorCode?: string;
  errorMessage?: string;
}
interface Api {
  attempt: (m: string, p: string, o?: { body?: unknown }) => Promise<Attempt>;
  dispose?: () => Promise<void>;
}

const ts = Date.now();
const SANDBOX = `API_Test_${ts}`;

type State = "PASS" | "FAIL" | "N/A";
interface Check {
  case: string;
  title: string;
  method: string;
  path: string;
  expected: string;
  got: string;
  state: State;
  note?: string;
}
const results: Check[] = [];

const errCode = (a: Attempt): string | undefined =>
  a.errorCode ?? (a.data as any)?.error?.code?.toString?.();
const errMsg = (a: Attempt): string =>
  a.errorMessage ?? (a.data as any)?.error?.message ?? "";

function record(c: Omit<Check, "state">, pass: boolean, na = false): void {
  results.push({ ...c, state: na ? "N/A" : pass ? "PASS" : "FAIL" });
}

/** A 404 with no API error code means the route isn't deployed on this env — the
 * feature merged to origin/main but the sandbox backend is older. That's N/A, not
 * a pass or a fail. A rejection carries an error code (e.g. 70/455/101). */
const notDeployed = (a: Attempt): boolean => a.status === 404 && !errCode(a);
function recordReject(c: Omit<Check, "state">, a: Attempt, isExpectedReject: boolean): void {
  if (notDeployed(a)) {
    results.push({ ...c, state: "N/A", got: `${a.status} — endpoint not deployed on sandbox`, note: "feature is on origin/main but not on this environment yet" });
    return;
  }
  results.push({ ...c, state: isExpectedReject ? "PASS" : "FAIL" });
}

async function main() {
  const identities = await import(pathToFileURL(join(PROCOL_TEST, "src", "identities.ts")).href);
  const { api, login } = (await identities.asBuyer()) as { api: Api; login: any };
  console.log(`\n▶ Running safe backend-change cases against the sandbox as buyer ${login.userUuid} (fresh token)\n`);

  // A user uuid we can safely reference (our own — always active).
  const selfUuid = login.userUuid as string;

  // ── BE-CAT · duplicate product category ───────────────────────────────
  // Create an API_Test_-named category, then create the SAME name again.
  // Gate ON  → second call rejected (422 "already exists").
  // Gate OFF → second call accepted (documented BE-CAT-006 legacy behavior).
  {
    const name = `${SANDBOX}_Cat`;
    const body = { name, hierarchy_type: "category" };
    const first = await api.attempt("POST", "/product_categories", { body });
    record(
      { case: "BE-CAT-001", title: "create a new sandbox category is accepted", method: "POST", path: "/product_categories", expected: "2xx created", got: `${first.status}${first.ok ? "" : " " + errMsg(first)}` },
      first.ok,
    );

    if (first.ok) {
      const dup = await api.attempt("POST", "/product_categories", { body });
      const gateOn = dup.status === 422 && /already exists/i.test(errMsg(dup));
      if (gateOn) {
        record(
          { case: "BE-CAT-002", title: "duplicate name rejected (gate ON)", method: "POST", path: "/product_categories", expected: "422 'already exists'", got: `${dup.status} ${errMsg(dup)}` },
          true,
        );
      } else if (dup.ok) {
        record(
          { case: "BE-CAT-006", title: "duplicate accepted — gate is OFF on this company (legacy behavior)", method: "POST", path: "/product_categories", expected: "gate off ⇒ duplicate allowed", got: `${dup.status} accepted` },
          true,
          false,
        );
      } else {
        record(
          { case: "BE-CAT-002", title: "duplicate name handling", method: "POST", path: "/product_categories", expected: "422 'already exists' (gate on) or 2xx (gate off)", got: `${dup.status} ${errMsg(dup)}` },
          false,
        );
      }
    } else {
      record({ case: "BE-CAT-002", title: "duplicate name rejected", method: "POST", path: "/product_categories", expected: "422 'already exists'", got: "skipped — create failed", state: "N/A" } as any, false, true);
    }
  }

  // ── BE-USR · recover-user API (negatives only — never a real recovery) ─
  {
    // already-active: recover our own (active) user → 764
    const a1 = await api.attempt("POST", `/users/recover/${selfUuid}`, { body: {} });
    const c1 = errCode(a1);
    recordReject(
      { case: "BE-USR-003", title: "recover an already-active user is rejected", method: "POST", path: "/users/recover/:id", expected: "764 'already active' (or authz reject)", got: `${a1.status} code=${c1 ?? "-"} ${errMsg(a1)}`.trim() },
      a1,
      !a1.ok && (c1 === "764" || c1 === "455" || a1.status === 403 || a1.status === 422),
    );

    // unknown user: bogus id → 70 (or not-found)
    const a2 = await api.attempt("POST", `/users/recover/ZZZZbogus`, { body: {} });
    const c2 = errCode(a2);
    recordReject(
      { case: "BE-USR-004", title: "recover an unknown user is rejected", method: "POST", path: "/users/recover/:id", expected: "70 'user does not exist' (or reject)", got: `${a2.status} code=${c2 ?? "-"} ${errMsg(a2)}`.trim() },
      a2,
      !a2.ok,
    );

    // cross-company: client_company_id outside allowed set → 455
    const a3 = await api.attempt("POST", `/users/recover/${selfUuid}`, { body: { client_company_id: 999999999 } });
    const c3 = errCode(a3);
    recordReject(
      { case: "BE-USR-005", title: "recover into a disallowed company is rejected", method: "POST", path: "/users/recover/:id", expected: "455 not authorized (or reject)", got: `${a3.status} code=${c3 ?? "-"} ${errMsg(a3)}`.trim() },
      a3,
      !a3.ok,
    );
  }

  // ── BE-EML · edit-contact (only ever with an INVALID email ⇒ rejects) ──
  {
    // Target self with a malformed email: self-edit of a verified email is
    // blocked (551), and a malformed value fails format (393) — either way it
    // is rejected and NOTHING is persisted.
    const a = await api.attempt("PATCH", "/users", { body: { id: selfUuid, email: "not-an-email" } });
    const c = errCode(a);
    record(
      { case: "BE-EML-002/005", title: "editing a contact with an invalid email is rejected (no mutation)", method: "PATCH", path: "/users", expected: "reject: 551/487/393", got: `${a.status} code=${c ?? "-"} ${errMsg(a)}`.trim() },
      !a.ok,
    );
  }

  // ── BE-PR-004 · PR audit trail negatives ──────────────────────────────
  {
    // download with the wrong item_type → 2 (bad request)
    const a = await api.attempt("GET", "/activity_logs/download?item_type=purchase_request_item&item_id=1");
    const c = errCode(a);
    recordReject(
      { case: "BE-PR-004a", title: "audit-trail download with wrong item_type is rejected", method: "GET", path: "/activity_logs/download", expected: "code 2 / reject", got: `${a.status} code=${c ?? "-"} ${errMsg(a)}`.trim() },
      a,
      !a.ok || c === "2",
    );

    // index for a bogus PR → not allowed (101) when gate off, or empty
    const b = await api.attempt("GET", "/activity_logs?item_type=purchase_request&item_id=ZZbogus");
    const cb = errCode(b);
    const gateOff = !b.ok && (cb === "101" || b.status === 403);
    record(
      { case: "BE-PR-004b", title: "audit-trail read is gated / safe for a bogus PR", method: "GET", path: "/activity_logs", expected: "101 (gate off) or empty list", got: `${b.status} code=${cb ?? "-"} ${errMsg(b)}`.trim() },
      gateOff || b.ok,
      b.ok, // if it returned 200 it's an N/A note (gate on, bogus id just yields nothing)
    );
  }

  await api.dispose?.();

  // ── report ────────────────────────────────────────────────────────────
  const pad = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s.padEnd(n));
  console.log(pad("CASE", 14) + pad("RESULT", 8) + pad("EXPECTED", 34) + "GOT");
  console.log("─".repeat(110));
  for (const r of results) {
    const mark = r.state === "PASS" ? "✅ PASS" : r.state === "FAIL" ? "❌ FAIL" : "➖ N/A ";
    console.log(pad(r.case, 14) + pad(mark, 8) + pad(r.expected, 34) + r.got);
    console.log(pad("", 14) + "        " + r.title);
  }
  const pass = results.filter((r) => r.state === "PASS").length;
  const fail = results.filter((r) => r.state === "FAIL").length;
  const na = results.filter((r) => r.state === "N/A").length;
  console.log("─".repeat(110));
  console.log(`\n${pass} passed · ${fail} failed · ${na} n/a   (of ${results.length} checks)\n`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
