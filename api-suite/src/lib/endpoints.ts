import { ClientConfig, ClientEndpoints, DatasourceConfig } from '../types';
import { resolveBaseUrl } from './auth';

/** Endpoint templates observed on this platform. A client config may override
 * any of them; discovery writes these in for new clients. */
export const DEFAULT_ENDPOINTS: ClientEndpoints = {
  modules: '/api/v1/dashboard_configuration',
  schema: '/api/flexi_datasources/{datasourceUuid}',
  view: '/api/fx_views/{viewUuid}',
  searchRecords: '/api/fx_views/records',
  createRecord: '/api/fx_responses/create_row',
  getRecord: '/api/fx_responses/{recordUuid}',
  updateRecord: '/api/fx_responses/{recordUuid}',
  triggerAutomation: '/fx_automations/trigger_automation',
  /** POST — submits a record into its approval flow. This, not an automation
   * trigger, is how a document leaves draft on this platform. */
  submitForApproval: '/api/approval_workflow/approval_requests',
  /** GET — the approval state of one record, including the flow it is in and
   * the approver uuid needed to resolve it. The discovery source for both, so
   * neither has to be hardcoded per client. */
  recordApprovals: '/api/fx_responses/{recordUuid}/get_approvals',
  /** POST — approve or reject a pending approval request. */
  resolveApproval: '/api/approval_workflow/approval_requests/resolve_approval',
  /** GET — the remarks/audit trail on a record. */
  remarks: '/api/remarks',
  /** GET — the tenant's approval flows. Exposes numeric ids and names only. */
  approvalFlows: '/api/approval_workflow/approval_flows',
  /** GET — approval tasks awaiting the caller, across all documents. */
  pendingApprovals: '/api/approval_workflow/approval_requests/get_pending_approvals',
};

function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    if (!(key in values)) {
      throw new Error(`No value provided for path placeholder "{${key}}" in "${template}"`);
    }
    return encodeURIComponent(values[key]);
  });
}

function join(baseUrl: string, urlPath: string): string {
  return `${baseUrl.replace(/\/$/, '')}${urlPath.startsWith('/') ? urlPath : `/${urlPath}`}`;
}

function endpoint(client: ClientConfig, name: keyof ClientEndpoints): string {
  const template = client.endpoints?.[name] ?? DEFAULT_ENDPOINTS[name];
  if (!template) throw new Error(`Client "${client.id}" has no endpoints.${name} configured.`);
  return template;
}

export function modulesUrl(client: ClientConfig): string {
  return join(resolveBaseUrl(client), endpoint(client, 'modules'));
}

export function schemaUrl(client: ClientConfig, datasourceUuid: string): string {
  return join(resolveBaseUrl(client), fillTemplate(endpoint(client, 'schema'), { datasourceUuid }));
}

export function viewUrl(client: ClientConfig, viewUuid: string): string {
  return join(resolveBaseUrl(client), fillTemplate(endpoint(client, 'view'), { viewUuid }));
}

/** Generic record search — how a relation gets resolved to a real record. */
export function searchRecordsUrl(
  client: ClientConfig,
  datasourceUuid: string,
  params: { page?: number; perPage?: number } = {}
): string {
  const url = new URL(join(resolveBaseUrl(client), endpoint(client, 'searchRecords')));
  url.searchParams.set('datasource_uuid', datasourceUuid);
  url.searchParams.set('page', String(params.page ?? 1));
  if (params.perPage) url.searchParams.set('per_page', String(params.perPage));
  return url.toString();
}

export function createRecordUrl(client: ClientConfig, _datasource?: DatasourceConfig): string {
  return join(resolveBaseUrl(client), endpoint(client, 'createRecord'));
}

export function getRecordUrl(client: ClientConfig, recordUuid: string): string {
  return join(resolveBaseUrl(client), fillTemplate(endpoint(client, 'getRecord'), { recordUuid }));
}

export function updateRecordUrl(client: ClientConfig, recordUuid: string): string {
  return join(resolveBaseUrl(client), fillTemplate(endpoint(client, 'updateRecord'), { recordUuid }));
}

export function submitForApprovalUrl(client: ClientConfig): string {
  return join(resolveBaseUrl(client), endpoint(client, 'submitForApproval'));
}

export function approvalFlowsUrl(client: ClientConfig): string {
  return join(resolveBaseUrl(client), endpoint(client, 'approvalFlows'));
}

export function pendingApprovalsUrl(client: ClientConfig): string {
  return join(resolveBaseUrl(client), endpoint(client, 'pendingApprovals'));
}

export function recordApprovalsUrl(client: ClientConfig, recordUuid: string): string {
  return join(resolveBaseUrl(client), fillTemplate(endpoint(client, 'recordApprovals'), { recordUuid }));
}

export function resolveApprovalUrl(client: ClientConfig): string {
  return join(resolveBaseUrl(client), endpoint(client, 'resolveApproval'));
}

export function remarksUrl(client: ClientConfig, recordUuid: string, itemType = 'FxResponse'): string {
  const url = new URL(join(resolveBaseUrl(client), endpoint(client, 'remarks')));
  url.searchParams.set('item_type', itemType);
  url.searchParams.set('item_uuid', recordUuid);
  return url.toString();
}

export function triggerAutomationUrl(client: ClientConfig, automationUuid: string): string {
  const url = new URL(join(resolveBaseUrl(client), endpoint(client, 'triggerAutomation')));
  url.searchParams.set('automation_uuid', automationUuid);
  return url.toString();
}
