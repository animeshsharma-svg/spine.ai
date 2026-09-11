import { APIRequestContext, APIResponse, expect } from '@playwright/test';
import { config, headers } from './config';

export interface ApiCallResult {
  response: APIResponse;
  elapsedMs: number;
  body: any;
}

/** Fires one request, times it, and parses the JSON body -- the building block every step uses. */
export async function callApi(
  request: APIRequestContext,
  method: 'GET' | 'POST' | 'PATCH',
  url: string,
  data?: unknown
): Promise<ApiCallResult> {
  const start = Date.now();
  const response = await request.fetch(url, { method, data, headers: headers() });
  const elapsedMs = Date.now() - start;
  const body = await response.json().catch(() => undefined);
  return { response, elapsedMs, body };
}

/** Status code + response time -- the two checks every single step asserts, same as the
 * Postman collection's collection-level Tests tab. Pass `heavy: true` for workflow-run /
 * automation-trigger endpoints, which do real cross-record server-side work and get a looser
 * budget (see config.maxResponseTimeMsHeavy). */
export function assertCommon(response: APIResponse, elapsedMs: number, heavy = false) {
  const budget = heavy ? config.maxResponseTimeMsHeavy : config.maxResponseTimeMs;
  expect(response.status(), 'status code should be 2xx').toBeGreaterThanOrEqual(200);
  expect(response.status(), 'status code should be 2xx').toBeLessThan(300);
  expect(elapsedMs, `response time should be below ${budget}ms`).toBeLessThan(budget);
}

/** Looks up one field's value in a create_row/PATCH response's field_responses[] array. */
export function findField(body: any, fieldUuid: string): any {
  return (body.field_responses || []).find((f: any) => f.fx_datasource_field_uuid === fieldUuid);
}

/** Some relation fields (e.g. Cost Center, Buyer GST) don't echo a resolved value in the SAME
 * PATCH response -- confirmed live: Cost Center comes back as a raw internal id (not the
 * record_uuid we sent), Buyer GST comes back with no `value` at all in that response, both
 * resolve correctly on a later GET. So for these we don't compare values; instead we assert
 * updated_at actually moved past created_at, which proves this specific PATCH modified the
 * field -- a blank placeholder field_response row exists for every field from record creation,
 * so mere row *existence* proves nothing on its own. */
export function assertFieldTouched(body: any, fieldUuid: string, label: string) {
  const fr = findField(body, fieldUuid);
  expect(fr, `field_response for ${fieldUuid} (${label}) should exist`).toBeTruthy();
  expect(
    fr.updated_at,
    `${label} (${fieldUuid}) updated_at should differ from created_at, proving this PATCH modified it`
  ).not.toBe(fr.created_at);
}

/** Looks up a column's index in a fx_views/records response's headers[] array by field_id --
 * dynamic lookup rather than a hardcoded position, so it survives schema reordering. */
export function findColumnIndex(headersArr: any[], fieldId: string): number {
  return headersArr.findIndex((h) => h && typeof h === 'object' && h.field_id === fieldId);
}

export function qs(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
}
