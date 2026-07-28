// Cloudflare D1 over its HTTP REST API — works from any host (Vercel, Render,
// local dev), no Workers runtime needed. Tables auto-create on first request,
// so deploys need only the three CLOUDFLARE_* env vars.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  pass_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('expense','income','transfer')),
  amount INTEGER NOT NULL CHECK (amount >= 0),
  category TEXT NOT NULL DEFAULT 'Other',
  note TEXT NOT NULL DEFAULT '',
  project TEXT NOT NULL DEFAULT '',
  account TEXT NOT NULL DEFAULT 'Cash',
  to_account TEXT NOT NULL DEFAULT '',
  occurred_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  rev INTEGER NOT NULL DEFAULT 1,
  deleted INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'manual'
);
CREATE INDEX IF NOT EXISTS idx_tx_user_time ON transactions(user_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_tx_user_updated ON transactions(user_id, updated_at);
CREATE TABLE IF NOT EXISTS budgets (
  user_id TEXT NOT NULL,
  month TEXT NOT NULL,
  category TEXT NOT NULL,
  amount INTEGER NOT NULL,
  carry_forward INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, month, category)
);`;

function endpoint() {
  const acct = process.env.CLOUDFLARE_ACCOUNT_ID;
  const dbId = process.env.CLOUDFLARE_DATABASE_ID;
  if (!acct || !dbId || !process.env.CLOUDFLARE_D1_TOKEN) {
    throw new Error('Missing CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_DATABASE_ID / CLOUDFLARE_D1_TOKEN env vars');
  }
  const base = process.env.CLOUDFLARE_API_BASE || 'https://api.cloudflare.com';
  return `${base}/client/v4/accounts/${acct}/d1/database/${dbId}/query`;
}

async function rawQuery(sql, params = []) {
  const res = await fetch(endpoint(), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.CLOUDFLARE_D1_TOKEN}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ sql, params }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    const msg = data?.errors?.[0]?.message || `D1 API ${res.status}`;
    throw new Error(`D1 query failed: ${msg}`);
  }
  // Multi-statement requests return one result per statement; return the last.
  const results = data.result || [];
  return results[results.length - 1] || { results: [], meta: {} };
}

let schemaRun;
function ensureSchema() {
  if (!schemaRun) schemaRun = rawQuery(SCHEMA).catch((e) => { schemaRun = null; throw e; });
  return schemaRun;
}

// q(sql, params) → { rows, meta } — SQLite dialect, `?` placeholders.
//
// Serverless-friendly: we do NOT pre-check the schema on every cold start
// (that would add a round-trip to each new instance). Instead we run the
// query directly and only create tables if the database says they're missing.
export async function q(sql, params = []) {
  try {
    const r = await rawQuery(sql, params);
    return { rows: r.results || [], meta: r.meta || {} };
  } catch (e) {
    if (!/no such table|no such column/i.test(e.message)) throw e;
    await ensureSchema();
    const r = await rawQuery(sql, params);
    return { rows: r.results || [], meta: r.meta || {} };
  }
}
