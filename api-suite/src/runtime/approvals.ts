import { ClientConfig, DatasourceConfig } from '../types';
import { apiRequest } from '../lib/httpClient';
import {
  approvalFlowsUrl,
  recordApprovalsUrl,
  remarksUrl,
  resolveApprovalUrl,
  updateRecordUrl,
} from '../lib/endpoints';

/**
 * The approval workflow — how a document leaves draft on this platform.
 *
 * There is no "submit" automation. Submitting means raising an approval
 * request; the document then walks its flow's steps until every approver has
 * resolved, at which point it is no longer a draft.
 *
 * What is and is not discoverable here, measured against the live API:
 *
 *   discoverable   the flow list, by name + NUMERIC id
 *                    GET /approval_workflow/approval_flows
 *                  a record's approval state, INCLUDING each step's and
 *                  approver's encoded uuid — but only when the `app-version`
 *                  header is sent (httpClient always sends it; without it the
 *                  platform answers 200 with every uuid stripped, which is
 *                  what made approving look impossible)
 *                    GET /fx_responses/{uuid}/get_approvals
 *                  the caller's own outstanding tasks
 *                    GET /approval_workflow/approval_requests/get_pending_approvals
 *
 *   NOT exposed    the flow's ENCODED uuid, which submit requires
 *
 * For the flow uuid the numeric and encoded forms are related by a salted hash
 * (flow 4293 is "Z1paa1E="), so the encoded form cannot be computed; sending
 * the numeric id returns 422 "Insufficient parameters". It is therefore
 * captured once per client into its config, and verified against the
 * discoverable flow NAME so a stale value is caught early rather than failing
 * as a confusing 422 mid-flow.
 */

export interface ApprovalFlow {
  /** the platform's encoded id */
  uuid?: string;
  name: string;
  status?: string;
  /** e.g. "p2p_create_po" — which document kind the flow belongs to */
  typeKey?: string;
}

/**
 * The flows configured for this tenant.
 *
 * Note the uuid is NOT a reliable way to pick a flow by name: Decathlon has 86
 * flows, many sharing the name "General PO approvals" and the same
 * `p2p_create_po` type, differing only by their `conditions`. Which one a given
 * document lands in is decided server-side. So this is a verification aid, not
 * a lookup — the uuid used for submit is captured per client into its config.
 */
export async function listApprovalFlows(client: ClientConfig): Promise<ApprovalFlow[]> {
  const res = await apiRequest<unknown>(client, approvalFlowsUrl(client));
  if (!res.ok) return [];
  const body = (res.body ?? {}) as Record<string, unknown>;
  const rows = (body.approval_flows ?? body.data ?? Object.values(body).find(Array.isArray) ?? []) as unknown[];
  return (rows as Array<Record<string, any>>)
    .filter((row) => row && typeof row === 'object')
    .map((row) => ({
      uuid: row.uuid,
      name: String(row.name ?? row.title ?? ''),
      status: row.status,
      typeKey: row.approval_type?.key,
    }));
}

export interface FlowCheck {
  ok: boolean;
  reason?: string;
  matched?: ApprovalFlow;
}

/**
 * Confirms the configured flow still exists under the configured name.
 *
 * The uuid cannot be checked directly — nothing exposes it — so the name is
 * the proxy. It turns "422 Insufficient parameters" three calls later into a
 * clear message here.
 */
export async function verifyApprovalFlow(
  client: ClientConfig,
  datasource: DatasourceConfig
): Promise<FlowCheck> {
  if (!datasource.approvalFlowUuid) {
    return { ok: false, reason: `${datasource.keyAttribute} has no approvalFlowUuid configured` };
  }
  if (!datasource.approvalFlowName) {
    // Nothing to verify against; the uuid may still be right.
    return { ok: true };
  }
  const flows = await listApprovalFlows(client);
  if (flows.length === 0) {
    return { ok: true, reason: 'flow list unavailable — could not verify, proceeding' };
  }
  const matched = flows.find((f) => f.name === datasource.approvalFlowName);
  if (!matched) {
    return {
      ok: false,
      reason:
        `no approval flow named "${datasource.approvalFlowName}" on this account ` +
        `(found: ${flows.map((f) => f.name).join(', ')}) — re-capture approvalFlowUuid`,
    };
  }
  return { ok: true, matched };
}

export interface ApproverState {
  /** the id resolve_approval needs. Present only when app-version is sent. */
  uuid?: string;
  status: string;
  approverType?: string;
  /** true when the CALLER may resolve this one; others need their own login */
  myApprovalRequired?: boolean;
  requestedFrom: string[];
}

export interface ApprovalStepState {
  uuid?: string;
  name?: string;
  status: string;
  approvers: ApproverState[];
}

export interface RecordApprovalState {
  /** overall status, e.g. "pending" | "completed" */
  status: string;
  flowName?: string;
  /** the flow's key_attribute, e.g. "p2p_create_po" */
  keyAttribute?: string;
  requestedBy?: string;
  steps: ApprovalStepState[];
  startedAt?: string;
  endedAt?: string;
  /** true when the document has cleared its whole flow */
  complete: boolean;
  /** false when the record has no approval request at all — still a draft */
  submitted: boolean;
}

/** Reads a record's position in its approval flow. */
export async function fetchRecordApprovals(
  client: ClientConfig,
  recordUuid: string
): Promise<RecordApprovalState> {
  const res = await apiRequest<unknown>(client, recordApprovalsUrl(client, recordUuid));
  const rows = (Array.isArray(res.body) ? res.body : [res.body]).filter(Boolean) as Array<
    Record<string, any>
  >;
  const first = rows[0];

  if (!res.ok || !first) {
    return { status: 'none', steps: [], complete: false, submitted: false };
  }

  const steps: ApprovalStepState[] = (first.approval_steps ?? []).map((step: any) => ({
    uuid: step.uuid,
    name: step.approval_step_name,
    status: String(step.status ?? ''),
    approvers: (step.approvers ?? []).map((a: any) => ({
      uuid: a.uuid,
      status: String(a.status ?? ''),
      approverType: a.approver_type,
      myApprovalRequired: a.my_approval_required,
      requestedFrom: Array.isArray(a.requested_from) ? a.requested_from.map(String) : [],
    })),
  }));

  const status = String(first.status ?? '');
  return {
    status,
    flowName: first.approval_flow_name,
    keyAttribute: first.approval_key_attribute,
    requestedBy: first.requested_by,
    steps,
    startedAt: first.started_at,
    endedAt: first.ended_at,
    complete: status === 'completed',
    submitted: true,
  };
}

/**
 * Approves (or rejects) a pending request.
 *
 * `approverUuid` is the platform's encoded approver id, read from
 * `get_approvals` (`approval_steps[].approvers[].uuid`). Prefer `approveRecord`,
 * which finds it for you and only resolves steps this caller may act on.
 */
export async function resolveApproval(
  client: ClientConfig,
  approverUuid: string,
  opts: { resolution?: 'accepted' | 'rejected'; remarks?: string } = {}
): Promise<{ ok: boolean; status: number; body?: unknown; error?: string }> {
  const res = await apiRequest(client, resolveApprovalUrl(client), {
    method: 'POST',
    body: {
      approver_uuid: approverUuid,
      resolution: opts.resolution ?? 'accepted',
      remarks: opts.remarks ?? '',
      attachments: [],
    },
  });
  return { ok: res.ok, status: res.status, body: res.body, error: res.error };
}

/** The remarks/audit trail on a record — what a reviewer would read. */
export async function fetchRemarks(
  client: ClientConfig,
  recordUuid: string
): Promise<{ ok: boolean; status: number; body?: unknown }> {
  const res = await apiRequest(client, remarksUrl(client, recordUuid));
  return { ok: res.ok, status: res.status, body: res.body };
}


export interface ApproveOutcome {
  /** how many approval steps this caller resolved */
  approved: number;
  /** final state after approving everything it could */
  state: RecordApprovalState;
  /** approvers still pending that belong to somebody else */
  waitingOn: string[];
  /** set when nothing could be approved and why */
  reason?: string;
}

/**
 * Approves every pending step the CALLER is entitled to resolve.
 *
 * A flow can have several steps, each with its own approver, and only the ones
 * flagged `my_approval_required` can be resolved with these credentials —
 * the rest need that user's own login. So this approves what it can, then
 * reports who the document is still waiting on rather than pretending it is
 * finished.
 *
 * The approver uuid comes from `get_approvals`, which only includes it when the
 * `app-version` header is sent; httpClient always sends it.
 */
export async function approveRecord(
  client: ClientConfig,
  recordUuid: string,
  opts: { remarks?: string; maxSteps?: number } = {}
): Promise<ApproveOutcome> {
  const maxSteps = opts.maxSteps ?? 5;
  let approved = 0;
  let state = await fetchRecordApprovals(client, recordUuid);

  if (!state.submitted) {
    return { approved: 0, state, waitingOn: [], reason: 'record has no approval request — not submitted' };
  }

  for (let pass = 0; pass < maxSteps; pass++) {
    const mine = state.steps
      .flatMap((step) => step.approvers)
      .find((a) => a.myApprovalRequired && a.status === 'pending' && a.uuid);
    if (!mine) break;

    const res = await resolveApproval(client, mine.uuid!, {
      resolution: 'accepted',
      remarks: opts.remarks ?? 'approved',
    });
    if (!res.ok) {
      return {
        approved,
        state,
        waitingOn: [],
        reason: `resolve_approval failed: HTTP ${res.status} ${res.error ?? ''}`.trim(),
      };
    }
    approved++;
    // Approving can open the next step, so re-read rather than assuming.
    state = await fetchRecordApprovals(client, recordUuid);
  }

  // Only steps that are themselves unresolved hold the document up. A step can
  // complete on one approver of several ("any one of"), leaving the others
  // pending but irrelevant — listing those read as "still blocked" next to
  // "fully approved", which is a contradiction.
  const waitingOn = state.complete
    ? []
    : state.steps
        .filter((step) => step.status !== 'completed')
        .flatMap((step) => step.approvers)
        .filter((a) => a.status === 'pending' && !a.myApprovalRequired)
        .flatMap((a) => a.requestedFrom);

  const reason =
    approved === 0
      ? state.complete
        ? 'already fully approved'
        : 'no pending step is approvable with these credentials'
      : undefined;

  return { approved, state, waitingOn: [...new Set(waitingOn)], reason };
}


export interface ApplicableFlow {
  /** true when the record now satisfies some flow's conditions */
  applicable: boolean;
  /** the flow to submit into, when one applies */
  uuid?: string;
  name?: string;
  /** how many flows the platform considers applicable */
  count: number;
}

/**
 * Asks the RECORD which approval flow applies to it.
 *
 * This is the reliable way to submit, and it removes the need to configure a
 * flow uuid per client at all. The flows endpoint cannot answer it: Decathlon
 * has 75 active `p2p_create_po` flows, every one conditional and several
 * identically named, and `/approval_flows/applicable` returns 570. Which flow
 * a document belongs to depends on the document's own values.
 *
 * The record's write response carries the answer as `approval_applicable` plus
 * an `approvals` array, and it CHANGES as the record is filled — observed on a
 * real Decathlon PO: `false` on create, still `false` after the first few
 * fields, then `true` with one flow once the cost centre and amounts were set.
 * So a record that is not yet eligible is a distinct, reportable state rather
 * than a mystery 422 from submit.
 *
 * Read via a no-op PATCH (an empty `responses` array), because the GET returns
 * a different projection — `headers`/`records`/`fields` — with no approval
 * information on it.
 */
export async function resolveApplicableFlow(
  client: ClientConfig,
  datasource: DatasourceConfig,
  recordUuid: string
): Promise<ApplicableFlow> {
  const res = await apiRequest<{
    approval_applicable?: boolean;
    approvals?: Array<{ uuid?: string; name?: string }>;
  }>(client, updateRecordUrl(client, recordUuid), {
    method: 'PATCH',
    body: { datasource_uuid: datasource.uuid, responses: [] },
  });

  const approvals = res.body?.approvals ?? [];
  return {
    applicable: res.body?.approval_applicable === true,
    uuid: approvals[0]?.uuid,
    name: approvals[0]?.name,
    count: approvals.length,
  };
}


/**
 * Moves a record into the state that makes an approval flow apply to it.
 *
 * Some tenants gate approval behind a status transition. On Decathlon a fully
 * populated PO still reports `approval_applicable: false` until `status` is set
 * to "Submitted" — traced through a captured UI session, where 21 field PATCHes
 * left it false and a single `{status: 2}` flipped it to true with one flow
 * offered. The sandbox needs no transition, so this is attempted only when the
 * record is not already eligible and is a no-op otherwise.
 *
 * `status` is normally platform-managed and the planner never sends it; this is
 * the one deliberate exception, and only as a transition rather than as part of
 * a create payload.
 */
export async function makeSubmittable(
  client: ClientConfig,
  datasource: DatasourceConfig,
  recordUuid: string
): Promise<ApplicableFlow & { transitioned?: string }> {
  const already = await resolveApplicableFlow(client, datasource, recordUuid);
  if (already.applicable) return already;

  const status = datasource.fields['status'];
  const options = status?.options ?? [];
  if (!status?.uuid || options.length === 0) return already;

  // Prefer an explicit "Submitted"; fall back to "In Approval" where a tenant
  // names the same step differently.
  const index = options.findIndex((o) => /^submitted$/i.test(o)) >= 0
    ? options.findIndex((o) => /^submitted$/i.test(o))
    : options.findIndex((o) => /in\s*approval/i.test(o));
  if (index < 0) return already;

  const res = await apiRequest<{
    approval_applicable?: boolean;
    approvals?: Array<{ uuid?: string; name?: string }>;
  }>(client, updateRecordUrl(client, recordUuid), {
    method: 'PATCH',
    body: {
      datasource_uuid: datasource.uuid,
      responses: [{ field_uuid: status.uuid, value: index }],
    },
  });
  if (!res.ok) return already;

  const approvals = res.body?.approvals ?? [];
  return {
    applicable: res.body?.approval_applicable === true,
    uuid: approvals[0]?.uuid,
    name: approvals[0]?.name,
    count: approvals.length,
    transitioned: options[index],
  };
}
