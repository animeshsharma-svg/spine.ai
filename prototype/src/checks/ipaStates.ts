/**
 * IN-PRINCIPLE APPROVAL start states (18 Nov 2026 — Amity University 55379, backend PR 17764 / FE PR 6319, live on UAT).
 *
 * A case about the approval starts from a project where it has been raised, approved by step 1, approved by both
 * (RFQ 2 made in Draft), or rejected. Those states are SET-UP, so they are built here through the very calls the
 * screens make — never by writing to the database:
 *   raise    GET  /event_groups/:eg/in_principle_approval/preview → POST /event_groups/:eg/in_principle_approval
 *            {approval_flow_uuid, attachments, remarks, step_uuid_vs_user_uuid, peer_uuid}   (the submit pop-up)
 *   resolve  POST /approval_workflow/approval_requests/resolve_approval
 *            {approver_uuid, resolution, remarks, attachments}   (the approval page's Approve / Reject, as the approver,
 *            signed in as that QA identity — qaIdentities.ts)
 *   recall   POST /approval_workflow/approval_requests/:uuid/withdraw_approval {remarks, attachments} (Withdraw Approval)
 * Every step is read back with SELECT (approval_requests / approval_steps / approvers / trade_requests).
 */
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { PROCOL_TEST } from "../executor.js";
import { loadIdentities } from "./qaIdentities.js";
import { decodeId, encodeId } from "./procolIds.js";

const imp = (rel: string) => import(pathToFileURL(join(PROCOL_TEST, "src", rel)).href);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface IpaRequest {
  /** approval_requests.id and its uuid (the approval page's :approvalRequestId) */
  id: number;
  uuid: string;
  status: number;
  currentStep: number;
  flowId: number;
}

/** The newest In-Principle approval request on a project (SELECT). */
export async function ipaRequestOf(eventGroupId: number): Promise<IpaRequest | null> {
  const { query } = await imp("db/pool.ts");
  const rows = await query(
    `select ar.id, ar.status, ar.current_step, ar.approval_flow_id from approval_requests ar
       join approval_flows f on f.id = ar.approval_flow_id
       join approvals a on a.id = f.approval_id
      where ar.resource_type = 'EventGroup' and ar.resource_id = $1 and a.key_attribute = 'in_principle_approval'
      order by ar.id desc limit 1`,
    [eventGroupId],
  );
  const r = rows[0];
  return r ? { id: Number(r.id), uuid: encodeId(Number(r.id)), status: Number(r.status), currentStep: Number(r.current_step), flowId: Number(r.approval_flow_id) } : null;
}

/** Raise the approval on a project with the workflow of this name, as the submit pop-up does. */
export async function raiseIpa(
  api: any,
  eventGroupUuid: string,
  flowName: string,
  remarks = "Raised by the spine.ai set-up to test In-Principle Approval.",
): Promise<{ ok: boolean; why?: string; request?: IpaRequest; value?: number; l1?: string; lines?: number }> {
  const pv = await api.attempt("GET", `/event_groups/${eventGroupUuid}/in_principle_approval/preview`);
  if (!pv.ok) return { ok: false, why: `the pop-up's preview was refused: HTTP ${pv.status} ${pv.errorMessage ?? ""}`.trim() };
  if (!pv.data?.eligible) return { ok: false, why: `the project is not eligible for In-Principle Approval (${pv.data?.reason ?? "no reason given"})` };
  const flow = (pv.data.approval_flows ?? []).find((f: any) => f?.name === flowName);
  if (!flow) return { ok: false, why: `the pop-up does not offer "${flowName}" (it offers: ${(pv.data.approval_flows ?? []).map((f: any) => f.name).join(", ") || "none"})` };
  const body = { approval_flow_uuid: flow.uuid, attachments: [], remarks, step_uuid_vs_user_uuid: {}, peer_uuid: null };
  const r = await api.attempt("POST", `/event_groups/${eventGroupUuid}/in_principle_approval`, { body });
  if (!r.ok) return { ok: false, why: `submitting was refused: HTTP ${r.status} ${r.errorMessage ?? JSON.stringify(r.data ?? "").slice(0, 200)}` };
  const egId = decodeId(eventGroupUuid);
  let request: IpaRequest | null = null;
  for (let i = 0; i < 10 && !request; i++) {
    request = egId ? await ipaRequestOf(egId) : null;
    if (!request) await sleep(1500);
  }
  if (!request) return { ok: false, why: "submitted, but no In-Principle approval request was found on the project afterwards" };
  return { ok: true, request, value: Number(pv.data.approval_value), l1: pv.data.l1_vendor?.name, lines: Number(pv.data.line_items_count) };
}

/** A buyer-side API session as one of the company's QA identities (the approver acting). */
export async function identityApi(companyId: number, key: string): Promise<{ api: any; userId: number; name: string }> {
  const id = loadIdentities(companyId).find((i) => i.key === key);
  if (!id) throw new Error(`no QA identity "${key}" on company ${companyId}`);
  const [{ authenticate }, { CONFIG }, { ApiClient }, { query }] = await Promise.all([imp("auth/login.ts"), imp("config.ts"), imp("api/client.ts"), imp("db/pool.ts")]);
  const [u] = await query(`select phone from users where id = $1`, [id.userId]);
  const phone = String(u?.phone ?? "").split("/").pop();
  // the email marks a QA test user — the only kind whose Terms of Use the login accepts on its own (705)
  const login = await authenticate({ ...CONFIG.identities.buyer, phone, email: id.email, tenantCompanyId: companyId });
  const api = await ApiClient.create(login, { baseURL: CONFIG.baseURL, appVersion: login.appVersion, identity: "buyer", companyId });
  return { api, userId: id.userId, name: id.name };
}

/** Approve or reject the request as the QA identity whose step is current, as the approval page does. */
export async function resolveIpaAs(
  companyId: number,
  key: string,
  request: IpaRequest,
  resolution: "approved" | "rejected",
  remarks: string,
): Promise<{ ok: boolean; why?: string; after?: IpaRequest | null }> {
  const { query } = await imp("db/pool.ts");
  const me = await identityApi(companyId, key);
  try {
    // the approver row of this user on the request's open step
    const rows = await query(
      `select ap.id from approvers ap join approval_steps st on st.id = ap.approval_step_id
        where st.approval_request_id = $1 and ap.approver_identifier = $2 order by st."order", ap.id`,
      [request.id, `u-${me.userId}`],
    );
    if (!rows.length) return { ok: false, why: `${me.name} is not an approver on request ${request.id}` };
    let last: any;
    for (const row of rows) {
      last = await me.api.attempt("POST", "/approval_workflow/approval_requests/resolve_approval", {
        // the page sends "accepted" / "rejected" (18 Nov 2026: "approved" → 422 "Invalid resolution value")
        body: { approver_uuid: encodeId(Number(row.id)), resolution: resolution === "approved" ? "accepted" : "rejected", remarks, attachments: [] },
      });
      if (last.ok) break;
    }
    if (!last?.ok) return { ok: false, why: `${me.name}'s ${resolution === "approved" ? "approval" : "rejection"} was refused: HTTP ${last?.status} ${last?.errorMessage ?? ""}`.trim() };
    await sleep(1500);
    const egRows = await query(`select resource_id from approval_requests where id = $1`, [request.id]);
    return { ok: true, after: await ipaRequestOf(Number(egRows[0]?.resource_id)) };
  } finally {
    await Promise.resolve(me.api.dispose?.()).catch(() => {});
  }
}

/** Withdraw (recall) the request as the person who raised it. */
export async function recallIpa(api: any, request: IpaRequest, remarks = "Recalled by the spine.ai set-up."): Promise<{ ok: boolean; why?: string }> {
  const r = await api.attempt("POST", `/approval_workflow/approval_requests/${request.uuid}/withdraw_approval`, { body: { remarks, attachments: [] } });
  return r.ok ? { ok: true } : { ok: false, why: `the recall was refused: HTTP ${r.status} ${r.errorMessage ?? ""}`.trim() };
}

/** Wait for the RFQ 2 stage Procol makes after the last approval (SELECT): its trade id, ref, title and status. */
export async function waitForRfq2(eventGroupId: number, firstStageId: number, ms = 120_000): Promise<{ id: number; uuid: string; ref: string; title: string } | null> {
  const { query } = await imp("db/pool.ts");
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const rows = await query(
      `select id, ref_id, title from trade_requests where event_group_id = $1 and id > $2 order by id desc limit 1`,
      [eventGroupId, firstStageId],
    );
    if (rows[0]) return { id: Number(rows[0].id), uuid: encodeId(Number(rows[0].id)), ref: String(rows[0].ref_id), title: String(rows[0].title ?? "") };
    await sleep(4000);
  }
  return null;
}
