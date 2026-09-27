import { ClientConfig, DatasourceConfig } from '../types';
import { apiRequest, TimedResponse } from '../lib/httpClient';
import { createRecordUrl, getRecordUrl, submitForApprovalUrl, triggerAutomationUrl } from '../lib/endpoints';
import { DocumentPlan, PlannedField } from '../lib/plan';
import { makeSubmittable } from './approvals';

/**
 * ============================== UNVERIFIED ==============================
 * The create payload shape below is INFERRED, not observed. Every request in
 * the HAR captures we have is a GET; no record creation has been recorded.
 *
 * Everything else in this repo is built from real captured responses. This
 * file is the one place that isn't, and it is deliberately isolated here so
 * that correcting it is a single-file change once a create is captured:
 *
 *   1. Create a PO in the UI with DevTools recording (Preserve log on).
 *   2. Save as HAR with content.
 *   3. Compare the real POST body against buildPayload() below and fix it.
 *
 * Until then every write path is gated behind RUN_WRITE_TESTS=1 so no suite
 * run depends on this guess. PAYLOAD_SHAPE exists so the alternatives can be
 * tried without rewriting callers.
 * =======================================================================
 */
export type PayloadShape = 'responses_array' | 'flat_map' | 'nested_data';

export const PAYLOAD_SHAPE: PayloadShape =
  (process.env.PO_PAYLOAD_SHAPE as PayloadShape) || 'responses_array';

export interface CreateResult {
  ok: boolean;
  status: number;
  durationMs: number;
  recordUuid?: string;
  body?: unknown;
  error?: string;
}

/** Builds the request body from a plan. See the UNVERIFIED banner above. */
export function buildPayload(
  datasource: DatasourceConfig,
  fields: PlannedField[],
  shape: PayloadShape = PAYLOAD_SHAPE
): Record<string, unknown> {
  switch (shape) {
    case 'flat_map':
      return {
        datasource_uuid: datasource.uuid,
        fields: Object.fromEntries(fields.map((f) => [f.uuid, f.value])),
      };
    case 'nested_data':
      return {
        datasource_uuid: datasource.uuid,
        data: fields.map((f) => ({ field_uuid: f.uuid, value: f.value })),
      };
    case 'responses_array':
    default:
      return {
        datasource_uuid: datasource.uuid,
        responses: fields.map((f) => ({ field_uuid: f.uuid, value: f.value })),
      };
  }
}

/** Pulls the new record's uuid out of a create response, tolerating the
 * several shapes this platform uses across endpoints. */
export function extractRecordUuid(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const b = body as Record<string, any>;
  return (
    // `fx_response_uuid` is what create_row actually returns on this platform;
    // the rest are shapes seen in other captures, kept as fallbacks.
    b.fx_response_uuid ??
    b.uuid ??
    b.record_uuid ??
    b.data?.uuid ??
    b.data?.record_uuid ??
    b.response?.fx_response_uuid ??
    b.response?.uuid ??
    b.record?.uuid
  );
}

export async function createRecord(
  client: ClientConfig,
  datasource: DatasourceConfig,
  plan: DocumentPlan
): Promise<CreateResult> {
  const res = await apiRequest(client, createRecordUrl(client, datasource), {
    method: 'POST',
    body: buildPayload(datasource, plan.fields),
  });
  return {
    ok: res.ok,
    status: res.status,
    durationMs: res.durationMs,
    recordUuid: res.ok ? extractRecordUuid(res.body) : undefined,
    body: res.body,
    error: res.error,
  };
}

export async function fetchRecord(
  client: ClientConfig,
  recordUuid: string
): Promise<TimedResponse<{ records?: unknown[]; fields?: unknown[] }>> {
  return apiRequest(client, getRecordUrl(client, recordUuid));
}

/**
 * Submits a document out of draft.
 *
 * This is an APPROVAL REQUEST, not an automation trigger — captured from a real
 * submit in the UI:
 *
 *   POST /api/approval_workflow/approval_requests
 *   { approval_flow_uuid, user_step_hash: {}, remarks, attachments,
 *     resource_type: "FxResponse", resource_uuid }
 *
 * An earlier version looked for a `submitAutomationUuid` in the datasource's
 * view template. The platform exposes no such automation for these documents,
 * and no view template at all on the schema endpoint, so submit silently
 * skipped and every created PO stayed in draft.
 *
 * `approvalFlowUuid` is tenant configuration and differs per client, so it
 * comes from the client config rather than being hardcoded.
 */
export async function submitDocument(
  client: ClientConfig,
  datasource: DatasourceConfig,
  recordUuid: string,
  opts: { remarks?: string } = {}
): Promise<CreateResult> {
  // Ask the record which flow applies. Preferred over any configured value:
  // flows are conditional, so the right one depends on the record's own data
  // and cannot be pinned per client. Falls back to the configured uuid when
  // the platform declines to say.
  // Also performs the status transition where a tenant gates approval on it.
  const applicable = await makeSubmittable(client, datasource, recordUuid);
  /**
   * The configured uuid is a fallback for SILENCE, not an override of a "no".
   *
   * When the platform has looked at this record and said no flow applies,
   * submitting into a flow uuid captured months ago is not a second opinion —
   * it is asking a question that has been answered and getting "Invalid
   * Approval" back. The fallback belongs only where the platform declined to
   * answer at all.
   */
  const flowUuid = applicable.uuid ?? (applicable.answered ? undefined : datasource.approvalFlowUuid);

  if (!flowUuid && !applicable.applicable) {
    return {
      ok: false, status: 0, durationMs: 0,
      error:
        `${datasource.keyAttribute} record ${recordUuid} is not eligible for approval` +
        (applicable.transitioned ? ` even after moving it to "${applicable.transitioned}"` : "") +
        `: the platform reports approval_applicable=false with ${applicable.count} flow(s) offered. ` +
        `Every mandatory field is set, so this is the account's own approval rules — no flow on it ` +
        `accepts a document raised by this user. Check that the login belongs to a team named as an ` +
        `initiator on a flow for ${datasource.keyAttribute}.`,
    };
  }

  if (flowUuid) {
    const res = await apiRequest(client, submitForApprovalUrl(client), {
      method: 'POST',
      body: {
        approval_flow_uuid: flowUuid,
        user_step_hash: {},
        remarks: opts.remarks ?? '',
        attachments: [],
        resource_type: 'FxResponse',
        resource_uuid: recordUuid,
      },
    });
    return { ok: res.ok, status: res.status, durationMs: res.durationMs, body: res.body, error: res.error };
  }

  // Legacy fallback, kept for any client that really does submit via automation.
  if (datasource.submitAutomationUuid) {
    const res = await apiRequest(client, triggerAutomationUrl(client, datasource.submitAutomationUuid), {
      method: 'POST',
      body: { record_uuid: recordUuid },
    });
    return { ok: res.ok, status: res.status, durationMs: res.durationMs, body: res.body, error: res.error };
  }

  return {
    ok: false, status: 0, durationMs: 0,
    error:
      `No approvalFlowUuid on ${datasource.keyAttribute} — set it in ` +
      `config/clients/<id>.json so submit can leave draft.`,
  };
}
