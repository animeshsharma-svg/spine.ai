import Ajv from 'ajv';

const ajv = new Ajv({ allErrors: true, strict: false });

// Mirrors the 4 response-shape schemas in the Postman collection 1:1.

export const fxResponseSchema = {
  type: 'object',
  required: ['response', 'field_responses'],
  properties: {
    response: {
      type: 'object',
      required: ['uuid', 'fx_datasource_uuid', 'status'],
      properties: {
        uuid: { type: 'string', minLength: 1 },
        fx_datasource_uuid: { type: 'string' },
        status: { type: 'string' },
      },
    },
    field_responses: { type: 'array' },
  },
};

export const workflowRunSchema = {
  type: 'object',
  required: ['fx_response_uuid', 'fx_datasource_id'],
  properties: {
    fx_response_uuid: { type: 'string', minLength: 1 },
    fx_datasource_id: { type: 'string', minLength: 1 },
  },
};

// GET /api/fx_views/records?... (steps 10, 14 -- child-record lookups): paginated.
export const viewRecordsSchema = {
  type: 'object',
  required: ['headers', 'pagination'],
  properties: {
    headers: { type: 'array' },
    pagination: {
      type: 'object',
      required: ['current_page', 'per_page', 'total_pages'],
    },
  },
};

// GET /api/fx_responses/{uuid}? (steps 19, 20 -- fetch one record by id): same headers/records
// row-oriented shape, but NOT paginated -- confirmed live, no `pagination` key at all. Reusing
// viewRecordsSchema here was a real bug caught by an actual run against the live API.
export const responseDetailSchema = {
  type: 'object',
  required: ['headers', 'records'],
  properties: {
    headers: { type: 'array' },
    records: { type: ['array', 'null'] },
  },
};

export const automationTriggerSchema = {
  type: 'object',
  required: ['success'],
  properties: {
    success: { type: 'boolean' },
  },
};

export function validateSchema(schema: object, data: unknown): { valid: boolean; errors: string } {
  const validateFn = ajv.compile(schema);
  const valid = validateFn(data) as boolean;
  return { valid, errors: ajv.errorsText(validateFn.errors) };
}
