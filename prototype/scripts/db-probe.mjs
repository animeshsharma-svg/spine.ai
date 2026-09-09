// Quick, read-only look at a company's login-session state on UAT.
import { config as loadEnv } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(here, "..", "..", "procol test", ".env") });

const companyId = Number(process.argv[2] ?? 198678);
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  statement_timeout: 60_000,
  max: 2,
});
const CONSOLE = `s.status = 1 and s.access_token is not null and s.app_version like '9.4%' and u.status = 1`;

async function q(label, sql, params = []) {
  const t = Date.now();
  try {
    const r = await pool.query(sql, params);
    console.log(`\n### ${label}  (${Date.now() - t}ms, ${r.rowCount} rows)`);
    console.table(r.rows);
  } catch (e) {
    console.log(`\n### ${label}  FAILED after ${Date.now() - t}ms: ${e.message}`);
  }
}

// Candidate FAST operator lookup: grab the most-recent trade_requests for the
// company (cheap, ordered by primary key), then find which of those users has
// a live console session. Avoids aggregating the whole table.
await q(
  "FAST operator lookup (recent trade_requests → session)",
  `select u.id as user_id, u.email, u.role, s.app_version, s.created_at
     from sessions s
     join users u on u.id = s.user_id
    where ${CONSOLE}
      and u.id in (
        select tr.user_id from trade_requests tr
         where tr.company_id = $1
         order by tr.id desc
         limit 200
      )
    order by s.created_at desc
    limit 5`,
  [companyId],
);

await pool.end();
