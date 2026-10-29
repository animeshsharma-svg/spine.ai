// Read-only query against the Procol UAT database (DATABASE_URL from "procol test/.env").
//   node dbq.mjs "<sql>" [param ...]       → prints rows as JSON
// Every query runs inside a READ ONLY transaction, so nothing can be written.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const QA = "/Users/abcom/Desktop/p2p_endtoend_flow_api_automation/procol-qa-platform";
const { Pool } = createRequire(`${QA}/prototype/package.json`)("pg");
const env = readFileSync(`${QA}/procol test/.env`, "utf8");
const url = env.match(/^DATABASE_URL\s*=\s*"?([^"\n]+)"?/m)[1].trim();
const pool = new Pool({ connectionString: url, max: 1, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10_000 });
const [sql, ...params] = process.argv.slice(2);
const c = await pool.connect();
try {
  await c.query("BEGIN READ ONLY");
  await c.query("SET LOCAL statement_timeout = 20000");
  const r = await c.query(sql, params);
  console.log(JSON.stringify(r.rows, null, 1));
  await c.query("ROLLBACK");
} finally {
  c.release();
  await pool.end();
}
