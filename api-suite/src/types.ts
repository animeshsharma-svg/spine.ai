/**
 * Everything here is keyed by field NAME (each field's stable `key_attribute`,
 * e.g. "tolerance_quantity"), never by array index and never by the platform's
 * internal field UUID — UUIDs are per-tenant and not portable; key_attribute is.
 *
 * Ground truth: Procol's "Flexi" builder platform. A client account (tenant)
 * exposes *datasources* — generic record types with their own field schema.
 * `GET /api/v1/dashboard_configuration` lists the tenant's modules;
 * `GET /api/flexi_datasources/{uuid}` returns one module's field schema;
 * `fx_responses/*` does generic record CRUD.
 */

/** Tri-state: a field can be required, optional, or not-yet-determined. */
export type MandatoryState = true | false | 'unknown';

/**
 * The platform's field data types, as returned by the API as strings.
 * The database stores these as an integer enum instead — see
 * src/audit/dataTypeEnum.ts for the mapping.
 */
export type FieldDataType =
  | 'string'
  | 'text'
  | 'number'
  | 'date'
  | 'dropdown_select'
  | 'rollup'
  | 'attachment'
  | 'relational'
  | 'reference'
  | 'external_relation'
  | 'inverse_relation'
  | 'formula'
  | 'boolean';

/**
 * The `field_type` blob the schema endpoint returns per field. Shapes vary by
 * data_type; every member is optional and read defensively. Captured from real
 * Decathlon + sandbox schema responses.
 */
export interface RawFieldType {
  type?: string;
  /** authoritative mandatory flag — a strict superset of validation_configuration */
  is_required?: boolean;
  /** dropdown_select: the client's own option list */
  options?: string[];
  /** relational: the fx datasource this field points at */
  related_datasource_id?: number;
  /** external_relation: a platform table (e.g. "companies") rather than a datasource */
  related_datasource_table?: string;
  /** external_relation: the specific column read back, e.g. "companies.gst_no" */
  external_reference_name?: string;
  relation_id?: number;
  related_field_id?: number;
  /** reference: the relation field on this datasource driving the autofill */
  relation_field_id?: number;
  /** reference: the source field on the related datasource */
  referenced_field_id?: number;
  relationship_type?: string;
  /** rollup: how the parent aggregates a child field */
  aggregation_type?: string;
  parent_field_id?: number;
  target_field_id?: number;
  /** date: e.g. "DD-MM-YYYY" */
  format?: string;
  /** platform-side default; may be a literal, an index into options, or a generator */
  default?: { type?: string; value?: unknown; config?: Record<string, unknown> };
  precision?: number;
  [key: string]: unknown;
}

/** One rule from a field's `validation_configuration[]`. */
export interface ValidationRule {
  rule_type?: string;
  /** e.g. "is_required", "greater_than_current_date" */
  operator?: string;
  configuration?: Record<string, unknown>;
  error_message?: string;
  severity?: string;
}

export type AuthConfig =
  | { type: 'bearer'; tokenEnv: string }
  | { type: 'apiKey'; headerName: string; apiKeyEnv: string }
  | { type: 'basic'; usernameEnv: string; passwordEnv: string }
  /**
   * Logs in per run instead of carrying a captured token.
   *
   * For clients whose session tokens expire — a pasted `apiKey` value there is
   * dead within hours. Needs an OTP that can be known in advance (a sandbox
   * with a fixed code, or one supplied for the run); a genuine one-time code
   * cannot be automated. See src/lib/otpLogin.ts.
   */
  | {
      type: 'otp';
      headerName: string;
      phoneEnv: string;
      otpEnv: string;
      appKeyEnv: string;
      appSecretEnv: string;
      phonePrefix?: string;
      /**
       * Optional captured token that WINS when set.
       *
       * So a fresh token can be pasted in for an immediate run without
       * changing the auth type, and login takes over the moment it is
       * cleared — no either/or.
       */
      tokenEnv?: string;
    }
  | { type: 'none' };

/**
 * Path templates, relative to baseUrl. `{datasourceUuid}` / `{recordUuid}` /
 * `{viewUuid}` placeholders are filled per-call — see src/lib/endpoints.ts.
 */
export interface ClientEndpoints {
  /** GET — the tenant's module list. e.g. "/api/v1/dashboard_configuration" */
  modules: string;
  /** GET — field schema for one datasource. e.g. "/api/flexi_datasources/{datasourceUuid}" */
  schema: string;
  /** GET — resolve a view to its datasource. e.g. "/api/fx_views/{viewUuid}" */
  view?: string;
  /** GET — search records in a datasource, used to resolve relations. */
  searchRecords: string;
  /** POST — create a record. e.g. "/api/fx_responses/create_row" */
  createRecord: string;
  /** GET — fetch one record. e.g. "/api/fx_responses/{recordUuid}" */
  getRecord?: string;
  /** PATCH — update one record. */
  updateRecord?: string;
  /** POST — run a datasource automation. */
  triggerAutomation?: string;
  /** POST — submit a record into its approval flow. How a document leaves
   * draft on this platform; there is no "submit" automation. */
  submitForApproval?: string;
  /** GET — approval state of one record; discovery source for flow + approver. */
  recordApprovals?: string;
  /** POST — approve or reject a pending approval request. */
  resolveApproval?: string;
  /** GET — remarks/audit trail on a record. */
  remarks?: string;
  /** GET — the tenant's approval flows (numeric ids + names). */
  approvalFlows?: string;
  /** GET — approval tasks awaiting the caller. */
  pendingApprovals?: string;
}

/** One master field's presence/requiredness/shape for a single client+datasource. */
export interface ClientFieldEntry {
  present: boolean;
  mandatory: MandatoryState;
  /** this client's field UUID — required to build any request payload */
  uuid?: string;
  /** as reported by this client's schema; may differ across clients */
  dataType?: FieldDataType;
  label?: string;
  /** dropdown_select: this client's own valid options */
  options?: string[];
  /** relational: the fx datasource id this field points at (client-local) */
  relatedDatasourceId?: number;
  /** external_relation: the platform table, e.g. "companies" */
  relatedDatasourceTable?: string;
  /** external_relation: the exact column autofilled, e.g. "companies.gst_no".
   * Its presence means the platform fills this field from whichever record the
   * driving relation selected — we must never send it. */
  externalReferenceName?: string;
  /** reference: numeric id of the relation field on THIS datasource that drives
   * the autofill. Resolvable to a field name only via the database. */
  relationFieldId?: number;
  /** reference: numeric id of the source field on the RELATED datasource. */
  referencedFieldId?: number;
  /** rollup: how it aggregates, e.g. "sum" */
  aggregation?: string;
  /** date: the client's expected format, e.g. "DD-MM-YYYY" */
  format?: string;
  /** true when the schema marks the field read-only (never send a value) */
  readOnly?: boolean;
  /** true when the platform generates this column itself (sequence, title,
   * created_by_user_name). It carries no uuid and can never be addressed in a
   * payload. Recorded explicitly so a *lost* uuid is distinguishable from a
   * column that never had one. */
  synthetic?: boolean;
  /** non-required validation rules we surface but don't yet enforce */
  validations?: ValidationRule[];
}

/** What role a datasource plays in a document flow. */
export type DatasourceRole = 'header' | 'lineItem' | 'other';

/** One datasource (e.g. "p2p_purchase_order") as seen on a given client. */
export interface DatasourceConfig {
  /** this client's UUID for the datasource itself (not portable across clients) */
  uuid: string;
  /** platform-stable identifier, e.g. "p2p_po_line_item" — the portable key */
  keyAttribute: string;
  /** the platform's numeric id for this datasource. Relation fields name their
   * target by this id, so without it a relation cannot be addressed. Discovery
   * reads it from the schema endpoint's `datasource.id`; `npm run audit` can
   * also supply it from the database when the API is unavailable. */
  numericId?: number;
  displayName?: string;
  role?: DatasourceRole;
  /** lineItem only: keyAttribute of the header datasource it belongs to */
  parentKeyAttribute?: string;
  /** lineItem only: the field on THIS datasource that points back at the header */
  parentLinkField?: string;
  /** header only: keyAttribute of its line-item datasource, if any */
  lineItemKeyAttribute?: string;
  /** header only: the automation that submits the document, from view_template */
  submitAutomationUuid?: string;
  /**
   * Approval flow this document is submitted into.
   *
   * The submit endpoint requires the platform's ENCODED id (e.g. "Z1paa1E="),
   * and `GET /approval_workflow/approval_flows` exposes only the numeric id
   * (4293). The two are related by a salted hash, so the encoded form cannot be
   * derived — it is captured once per client. Passing the numeric id instead
   * returns 422 "Insufficient parameters".
   */
  approvalFlowUuid?: string;
  /**
   * The flow's human name, e.g. "PO approvals".
   *
   * This IS discoverable, so it is what makes the wiring verifiable: at run
   * time the flow list is fetched and the name checked, which catches an
   * approvalFlowUuid that points at a flow that was renamed or deleted.
   */
  approvalFlowName?: string;
  /**
   * Autofill graph: derived field name -> where its value comes from.
   * Populated by `npm run audit`, which resolves the numeric ids the API
   * exposes into field names using the database. Without it we can still
   * assert that a derived field was populated, just not what it came from.
   */
  autofill?: Record<string, AutofillSource>;
  /** field key_attribute -> presence/mandatory/uuid/shape for this client */
  fields: Record<string, ClientFieldEntry>;
}

/** Where a derived (autofilled) field's value originates. */
export interface AutofillSource {
  /** the relation field on this datasource that drives the autofill */
  via: string;
  /** keyAttribute of the datasource the value is read from */
  fromDatasource?: string;
  /** field name on that datasource */
  fromField?: string;
}

export interface ClientConfig {
  id: string;
  displayName?: string;
  baseUrlEnv: string;
  auth: AuthConfig;
  endpoints: ClientEndpoints;
  /** ISO date of the last successful discovery run */
  discoveredAt?: string;
  /**
   * `app-version` header for this client.
   *
   * Not cosmetic: the platform picks a response serializer from it, and
   * omitting it makes `get_approvals` return steps and approvers with their
   * uuids stripped — so a document cannot be approved. Defaults to a known
   * working version in httpClient.
   */
  appVersion?: string;
  /** datasource keyAttribute -> config */
  datasources: Record<string, DatasourceConfig>;
}

/** One entry in the master, name-keyed field registry. */
export interface MasterField {
  /** inferred type from discovery; informational */
  type?: string;
  /** human-readable label as last seen from any client; informational */
  label?: string;
  /** client ids this field has been observed in */
  seenIn: string[];
}

/** logical datasource name -> (field key_attribute -> MasterField) */
export type MasterFieldRegistry = Record<string, Record<string, MasterField>>;

/** Data a test wants to send, keyed by master field key_attribute. */
export type FieldValueMap = Record<string, unknown>;
