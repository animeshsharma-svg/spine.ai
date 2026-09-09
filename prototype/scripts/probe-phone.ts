/** One-off: map the REAL phone-field validation boundary on /users/create_user. */
import { openClientContext } from "../src/executor.js";

const companyId = Number(process.argv[2] ?? 198678);

// unique 9-digit suffix per case so we never collide with an existing user/vendor
function uniq9(i: number): string {
  const n = (Date.now() * 100 + i) % 1_000_000_000;
  return String(n).padStart(9, "0");
}

function cases() {
  return [
    { label: "start 9 (valid mobile)", phone: "9" + uniq9(1) },
    { label: "start 6 (valid mobile)", phone: "6" + uniq9(2) },
    { label: "start 1, 10 digits", phone: "1" + uniq9(3) },
    { label: "start 2, 10 digits", phone: "2" + uniq9(4) },
    { label: "start 5, 10 digits", phone: "5" + uniq9(5) },
    { label: "start 0, 10 digits", phone: "0" + uniq9(6) },
    { label: "11 digits", phone: "9" + uniq9(7) + "1" },
    { label: "9 digits (short by one)", phone: "9" + uniq9(8).slice(0, 8) },
    { label: "letters mixed", phone: "98" + "ABCDEFGH" },
    { label: "empty phone", phone: "" },
  ];
}

const client = await openClientContext(companyId);
try {
  const api = client.ctx.buyerApi;
  for (const c of cases()) {
    const s = Date.now();
    const body = {
      name: `QA_Platform_Probe_${s}`,
      email: `qa_probe_${s}@example.com`,
      phone: c.phone,
      phone_prefix: "+91",
      role: "member",
    };
    try {
      await api.post("/users/create_user", { body });
      console.log(`ACCEPT  200  | ${c.label.padEnd(28)} | "${c.phone}"`);
    } catch (e: any) {
      console.log(`REJECT  ${e?.status ?? "?"}  | ${c.label.padEnd(28)} | "${c.phone}" | ${e?.message}`);
    }
  }
} finally {
  await client.dispose().catch(() => {});
}
