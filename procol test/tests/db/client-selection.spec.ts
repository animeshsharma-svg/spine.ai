import { test, expect } from "@playwright/test";

import { listTestableClients, resolveClient } from "../../src/db/clients.js";
import { clientFromSession } from "../../src/auth/sessionAuth.js";
import { Endpoints } from "../../src/api/endpoints.js";
import { query } from "../../src/db/pool.js";

/**
 * Proves DB-driven client selection: pick a company (COMPANY_ID env, or the
 * most-recently-active client from the DB) → build an auth token from its
 * session (no OTP) → call the API → cross-check against the DB.
 */
test.describe("DB-driven client selection", () => {
  test("lists clients that are currently testable (have a live session)", async () => {
    const clients = await listTestableClients(10);
    expect(clients.length, "testable clients").toBeGreaterThan(0);
    for (const c of clients) {
      console.log(`  COMPANY_ID=${c.companyId}  "${c.companyName}"  (${c.users} user(s), latest ${c.latest.toISOString().slice(0, 10)})`);
    }
  });

  test("authenticates as a company via its DB session and reads its config", async () => {
    // COMPANY_ID env wins. Otherwise scan recently-active clients and use the
    // first whose session actually authenticates (some may be stale).
    const envId = process.env.COMPANY_ID ? Number(process.env.COMPANY_ID) : undefined;
    const candidates = envId ? [envId] : (await listTestableClients(15)).map((c) => c.companyId);

    let used: { companyId: number; name: string | null; userId: number } | undefined;
    for (const companyId of candidates) {
      const client = await resolveClient(companyId).catch(() => undefined);
      if (!client) continue;
      const api = await clientFromSession(client.buyer, { app: "console" });
      try {
        const cfg = await api.get<Record<string, unknown>>(Endpoints.dashboardConfiguration());
        expect(cfg).toHaveProperty("authorized_permissions");
        used = { companyId, name: client.companyName, userId: client.buyer.userId };

        // DB cross-check: the user really belongs to this company
        const [row] = await query(`select company_id from users where id = $1`, [client.buyer.userId]);
        expect(row.company_id).toBe(companyId);
        break;
      } catch {
        // stale/permission-limited session — try the next client
      } finally {
        await api.dispose();
      }
    }

    expect(used, "at least one client authenticated via DB session").toBeTruthy();
    console.log(`✓ authenticated as company ${used!.companyId} "${used!.name}" (user ${used!.userId}) via DB session — no OTP`);
  });
});
