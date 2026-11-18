/**
 * In-Principle Approval & Price Recovery (RFQ 2) — set-up for a company that has the feature (Amity University
 * 55379 on UAT, 18 Nov 2026). Everything here is SET-UP a tester would otherwise click through; the cases
 * themselves run in the sheet runner on screen.
 *
 *   npx tsx scripts/ipa-setup.ts probe    [--company 55379]   sign in, read the feature switch and the IPA type
 *   npx tsx scripts/ipa-setup.ts users    [--company 55379]   the QA users the guide names (approvers, collaborator, …)
 *
 * Never prints a login code or a token.
 */
import { openClientContext } from "../src/executor.js";
import { ensureQaUsers, type PersonaSpec } from "../src/checks/qaIdentities.js";

/** The people of the In-Principle Approval guide (§5.2) and the names the case sheet gives them. */
const IPA_PERSONAS: PersonaSpec[] = [
  { key: "approver_a", plays: ["Approver A", "Rohan Mehta", "Head of Procurement", "step 1 approver", "first approver"] },
  { key: "approver_b", plays: ["Approver B", "Anita Rao", "CFO", "step 2 approver", "second approver"] },
  { key: "approver_c", plays: ["Approver C", "Vikram Shah", "parallel approver"] },
  { key: "collaborator", plays: ["Collaborator", "Karthik Iyer", "collaborator with award rights", "project member"], note: "needs award rights on the project (purchase team)" },
  { key: "purchase_buyer", plays: ["Purchase buyer", "Karan Joshi", "new owner", "unrelated user"], note: "needs sourcing rights to be offered in Change owner" },
  { key: "view_only", plays: ["View-only user", "Neha", "user without award rights"] },
  { key: "no_sourcing", plays: ["Sunil", "user without sourcing rights"] },
  { key: "deactivated", plays: ["Deepa", "deactivated user"], note: "deactivated after creation" },
];

const args = process.argv.slice(2);
const arg = (k: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const company = Number(arg("company") ?? 55379);
const cmd = args[0] ?? "probe";

/** Procol's encoded id (the uuid the API takes for a numeric id). */
function uuidOf(id: number): string {
  const s = String(id * 3 + 1022).split("");
  const rot = [...s.slice(3), ...s.slice(0, 3)];
  const sp = "gZckDpNXdQ";
  return Buffer.from(rot.map((c) => sp[Number(c)]).join("")).toString("base64");
}

const c: any = await openClientContext(company);
const api = c.ctx.buyerApi;
try {
  if (cmd === "probe") {
    console.log(`signed in to ${c.companyName} (${company})`);
    const conf = await api.attempt("GET", "/v1/dashboard_configuration");
    const ipa = conf.data?.in_principle_approval ?? conf.data?.config?.in_principle_approval ?? null;
    console.log("dashboard_configuration:", conf.status, "in_principle_approval =", JSON.stringify(ipa));
    const keys = Object.keys(conf.data ?? {}).filter((k) => /principle|price_recovery/i.test(k));
    console.log("matching keys:", keys.join(", ") || "(none at top level)");
  } else if (cmd === "preview") {
    // READ ONLY: what the "Submit for In-Principle Approval" pop-up loads for a project (--eg <uuid>).
    const r = await api.attempt("GET", `/event_groups/${arg("eg")}/in_principle_approval/preview`);
    console.log(r.status, JSON.stringify(r.data, null, 1).slice(0, 6000));
  } else if (cmd === "flow-read") {
    // READ ONLY: how a workflow is stored (e.g. the dev's 7146), to create ours in the same shape.
    const r = await api.attempt("GET", `/approval_workflow/approval_flows/${uuidOf(Number(arg("id") ?? 7146))}`);
    console.log(r.status, JSON.stringify(r.data, null, 1).slice(0, 4000));
    const cond = await api.attempt("GET", "/approval_workflow/approval_flows/conditions");
    const list = Array.isArray(cond.data) ? cond.data : cond.data?.conditions ?? cond.data;
    console.log("conditions:", cond.status, JSON.stringify(list).slice(0, 2500));
  } else if (cmd === "flow") {
    // A QA In-Principle workflow, in the shape the app stores one (read from the dev's 7146 — never edited).
    //   --name "QA_Platform IPA 2-step" --steps approver_a,approver_b  (a step "approver_a+approver_c" = parallel)
    //   --min 1 --max 1000000  (value range, max exclusive)  --hours 24  --key total_proposal_value
    const { loadIdentities } = await import("../src/checks/qaIdentities.js");
    const name = arg("name") ?? "QA_Platform IPA 2-step";
    if (!/^QA_Platform IPA /.test(name)) throw new Error(`a QA workflow's name must start "QA_Platform IPA " (cleanup finds it by that)`);
    const ids = loadIdentities(company);
    const who = (k: string) => {
      const i = ids.find((x) => x.key === k);
      if (!i) throw new Error(`no QA identity ${k} on ${company} — run "users" first`);
      return { type: "user", uuid: uuidOf(i.userId) };
    };
    const hours = Number(arg("hours") ?? 24);
    const steps = (arg("steps") ?? "approver_a,approver_b").split(",").map((s, order) => ({
      name: `Step ${order + 1}`, order, expires_in: hours * 3600,
      config: { conditions: { acceptance_condition: `accepted_approvers >= ${s.includes("+") && args.includes("--all") ? s.split("+").length : 1}` }, no_of_approvals_required: false },
      approvers: s.split("+").map(who),
    }));
    const key = arg("key") ?? "total_proposal_value";
    const conditions = arg("min") === "none" ? [] : [{ key, values: [Number(arg("min") ?? 1), Number(arg("max") ?? 1000000)] }];
    const extra = arg("hub") ? [{ key: "buyer_hub_id", values: [arg("hub")] }] : [];
    const existing = await api.attempt("GET", `/approval_workflow/approval_flows?page=1&initiator_type=company`);
    const rows: any[] = existing.data?.approval_flows ?? existing.data?.data ?? (Array.isArray(existing.data) ? existing.data : []);
    const same = rows.find((f) => f?.name === name && f?.status !== "in_active");
    if (same) {
      console.log(`already there: ${name} (${same.uuid})`);
    } else {
      const body = { approval_flows: [{ name, approval_type: "in_principle_approval", config: {}, initiators: [{ type: "company", role: "super_admin" }], conditions: [...conditions, ...extra], steps }] };
      const r = await api.attempt("POST", "/approval_workflow/approval_flows/create_approval_flows", { body });
      const made = Array.isArray(r.data) ? r.data[0] : r.data?.approval_flows?.[0] ?? r.data;
      console.log(r.ok ? `created ${name} (${made?.uuid})` : `refused: HTTP ${r.status} ${r.errorMessage ?? JSON.stringify(r.data).slice(0, 300)}`);
      if (made?.uuid) {
        const back = await api.attempt("GET", `/approval_workflow/approval_flows/${made.uuid}`);
        const d = back.data;
        console.log(`read back: type ${d?.approval_type?.key}, ${d?.steps?.length} step(s): ${d?.steps?.map((s: any) => s.approvers.map((a: any) => a.name).join(" + ") + ` (${s.expires_in / 3600} h)`).join(" → ")}; conditions ${JSON.stringify(d?.conditions?.map((c: any) => [c.key, c.values]))}`);
      }
    }
  } else if (cmd === "users") {
    const r = await ensureQaUsers(company, IPA_PERSONAS, { buyerApi: api, onLine: (l) => console.log(l) });
    console.log(`QA users on ${company}: ${r.identities.length} recorded, ${r.created} created now.`);
  } else if (cmd === "team") {
    const { ensureQaTeam } = await import("../src/checks/qaIdentities.js");
    const r = await ensureQaTeam(company, { buyerApi: api, onLine: (l) => console.log(l) });
    console.log(r ? `team ${r.teamId}: ${r.added} added now` : "no team");
  } else if (cmd === "signin") {
    // Each QA user signs in once through the platform's own login (the UAT code rule) — proves `act_as` can.
    const { pathToFileURL } = await import("node:url");
    const { join } = await import("node:path");
    const { PROCOL_TEST } = await import("../src/executor.js");
    const { loadIdentities } = await import("../src/checks/qaIdentities.js");
    const [{ authenticate }, { CONFIG }] = await Promise.all([
      import(pathToFileURL(join(PROCOL_TEST, "src", "auth/login.ts")).href),
      import(pathToFileURL(join(PROCOL_TEST, "src", "config.ts")).href),
    ]);
    const { query } = await import(pathToFileURL(join(PROCOL_TEST, "src", "db/pool.ts")).href);
    for (const id of loadIdentities(company).filter((i) => !arg("key") || i.key === arg("key"))) {
      const [u] = await query(`select phone from users where id = $1`, [id.userId]);
      const phone = String(u?.phone ?? "").split("/").pop();
      try {
        // The email marks it a QA test user, the only kind whose Terms of Use the login accepts on its own (705).
        const login = await authenticate({ ...CONFIG.identities.buyer, phone, email: id.email, tenantCompanyId: company });
        console.log(`✓ ${id.key} (${id.name}) signed in${login?.otpSource ? ` with ${login.otpSource}` : ""}`);
      } catch (e) {
        console.log(`✗ ${id.key} (${id.name}) could not sign in — ${String((e as Error).message).split("\n")[0].replace(/\d{6}/g, "******")}`);
      }
    }
  } else {
    console.log(`unknown command ${cmd}`);
  }
} finally {
  await c.dispose().catch(() => {});
}
