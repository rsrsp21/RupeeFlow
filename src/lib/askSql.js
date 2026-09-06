// Model-authored SQL for the "ask" assistant.
//
// The pre-aggregated summary can only answer the questions someone thought to
// aggregate for in advance. Anything else — "what did chicken cost in August",
// "which shop do I spend most at on weekends" — came back as "I cannot",
// which reads as the assistant being useless when the rows were there the
// whole time. Letting the model write the query removes that ceiling.
//
// The obvious hazard is that this is a shared multi-tenant table, so a
// generated query must be structurally incapable of reading another user's
// rows or changing anything. Two independent defences, because a prompt
// instruction is not a security control:
//
//   1. The query is checked here against a strict allowlist grammar.
//   2. It runs against a single-user subquery, not the base table — the
//      user_id filter is bound by us, is not something the model can write,
//      and cannot be escaped by anything the grammar permits.
//
// A rejected query is not retried or "fixed up": the caller falls back to
// answering from the summary alone.

// Only these appear in a valid query. Anything else and we bail.
const ALLOWED_TABLES = new Set(['tx']);

// Statement must be a single bare SELECT/WITH. Semicolons are rejected
// outright rather than split on, so stacked statements can't arise at all.
const FORBIDDEN = /\b(insert|update|delete|drop|alter|create|replace|attach|detach|pragma|vacuum|reindex|analyze|begin|commit|rollback|savepoint|release|grant|revoke|truncate|load_extension|readfile|writefile|edit)\b/i;

// SQLite lets a comment hide the rest of a line, which is the classic way to
// neuter a trailing clause — so no comments at all.
const COMMENT = /(--|\/\*|\*\/|#)/;

export function validateSql(sql) {
  const s = String(sql || '').trim().replace(/\s+/g, ' ');
  if (!s) return { ok: false, reason: 'empty' };
  if (s.length > 2000) return { ok: false, reason: 'too long' };
  if (s.includes(';')) return { ok: false, reason: 'no semicolons' };
  if (COMMENT.test(s)) return { ok: false, reason: 'no comments' };
  if (!/^select\b/i.test(s)) return { ok: false, reason: 'must be a single SELECT' };
  if (FORBIDDEN.test(s)) return { ok: false, reason: 'statement type not allowed' };
  // The model is given exactly one relation to read. Any other identifier
  // after FROM/JOIN means it invented a table — including sqlite internals.
  for (const m of s.matchAll(/\b(?:from|join)\s+([a-z_][a-z0-9_]*)/gi)) {
    if (!ALLOWED_TABLES.has(m[1].toLowerCase())) return { ok: false, reason: `unknown table "${m[1]}"` };
  }
  // Belt and braces: user_id is not selectable or filterable by the model,
  // so it cannot correlate rows to a different account even in principle.
  if (/\buser_id\b/i.test(s)) return { ok: false, reason: 'user_id is not queryable' };
  return { ok: true, sql: s };
}

// Wraps the model's query so `tx` resolves to this user's rows only. The
// LIMIT is applied outside the model's query, so it holds even if the model
// wrote its own larger one.
export function buildScopedSql(userSql, maxRows = 200) {
  return `WITH tx AS (
      SELECT type, amount / 100.0 AS rupees, category, note, project,
             account, to_account, source,
             date(occurred_at / 1000, 'unixepoch') AS day,
             strftime('%Y-%m', occurred_at / 1000, 'unixepoch') AS month,
             strftime('%Y', occurred_at / 1000, 'unixepoch') AS year,
             occurred_at
        FROM transactions
       WHERE user_id = ? AND deleted = 0
    )
    SELECT * FROM (${userSql}) LIMIT ${Number(maxRows) | 0}`;
}

// Shown to the model so it knows what it may reference. Deliberately describes
// the VIEW, not the physical table — amounts are already rupees here, and the
// date parts are precomputed so the model doesn't have to get epoch-millis
// arithmetic right to answer "in August".
export const SQL_SCHEMA_NOTE = `One table is available:
tx(type TEXT 'expense'|'income'|'transfer', rupees REAL, category TEXT, note TEXT, project TEXT, account TEXT, to_account TEXT, source TEXT, day TEXT 'YYYY-MM-DD', month TEXT 'YYYY-MM', year TEXT 'YYYY', occurred_at INTEGER epoch-ms)
It already contains only this user's non-deleted transactions. "rupees" is already in rupees. "note" is the free-text item description the user typed (e.g. "chicken 1kg"), "project" is a user-defined group/trip label. Use LIKE with lower() for item matching, e.g. lower(note) LIKE '%chicken%'.`;
