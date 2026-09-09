import type { ApiClient } from "../api/client.js";
import { Endpoints } from "../api/endpoints.js";

export interface CompanyUser {
  uuid: string;
  name?: string;
  email?: string;
  phone?: string;
  role?: string;
}

/** List active users of the logged-in company (with their API uuids). */
export async function listCompanyUsers(api: ApiClient): Promise<CompanyUser[]> {
  const res = await api.get<any>(Endpoints.getAllUsers());
  const arr = Array.isArray(res) ? res : res.users ?? res.data ?? [];
  return arr as CompanyUser[];
}

/**
 * Pick a user uuid to act as the technical-stage evaluator. Prefers a user
 * other than the buyer (by email), else falls back to the first user.
 */
export async function resolveEvaluatorUuid(
  api: ApiClient,
  excludeEmail?: string,
): Promise<{ uuid: string; email?: string; name?: string }> {
  const users = await listCompanyUsers(api);
  if (users.length === 0) throw new Error("No company users found to assign as evaluator.");
  const pick =
    users.find((u) => u.uuid && (!excludeEmail || u.email !== excludeEmail)) ?? users[0];
  return { uuid: pick.uuid, email: pick.email, name: pick.name };
}
