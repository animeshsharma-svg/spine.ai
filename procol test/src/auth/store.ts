import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import type { AuthTokens } from "../api/client.js";

/** Where the buyer tokens are cached for reuse by flow specs. */
export const BUYER_AUTH_FILE = ".auth/buyer.json";

export interface CachedAuth extends AuthTokens {
  client: string;
}

export function saveAuth(file: string, data: CachedAuth): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2));
}

export function loadAuth(file: string): CachedAuth {
  return JSON.parse(readFileSync(file, "utf-8")) as CachedAuth;
}
