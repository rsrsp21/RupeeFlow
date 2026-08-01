// Ledger operations on D1 (SQLite dialect). Balances are ALWAYS derived from
// the ledger (never stored), so adding/editing/deleting any entry mid-history
// can never corrupt historical balance integrity. Sync is last-write-wins,
// enforced atomically in a single UPSERT per entry.
import { q } from './db.js';

const TX_FIELDS = 'id,type,amount,category,note,project,account,to_account,occurred_at,created_at,updated_at,rev,deleted,source';

export function sanitizeTx(t) {
  const now = Date.now();
  return {
    id: String(t.id || '').slice(0, 64),
    type: ['expense', 'income', 'transfer'].includes(t.type) ? t.type : 'expense',
    amount: Math.max(0, Math.round(Number(t.amount) || 0)), // integer paise
    category: String(t.category || 'Other').slice(0, 60),
    note: String(t.note || '').slice(0, 500),
    project: String(t.project || '').slice(0, 60),
    account: String(t.account || 'Cash').slice(0, 60),
    to_account: String(t.to_account || '').slice(0, 60),
    occurred_at: Number(t.occurred_at) || now,
    created_at: Number(t.created_at) || now,
    updated_at: Number(t.updated_at) || now,
    rev: Math.max(1, Number(t.rev) || 1),
    deleted: t.deleted ? 1 : 0,
    source: ['manual', 'voice', 'receipt'].includes(t.source) ? t.source : 'manual',
  };
}

// One atomic UPSERT per entry: insert if new, else update ONLY when the
// incoming write is strictly newer (LWW) and belongs to the same user.
const UPSERT = `
INSERT INTO transactions (id, user_id, type, amount, category, note, project, account, to_account,
  occurred_at, created_at, updated_at, rev, deleted, source)
VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
ON CONFLICT(id) DO UPDATE SET
  type=excluded.type, amount=excluded.amount, category=excluded.category, note=excluded.note,
  project=excluded.project, account=excluded.account, to_account=excluded.to_account,
  occurred_at=excluded.occurred_at, updated_at=excluded.updated_at, rev=excluded.rev,
  deleted=excluded.deleted, source=excluded.source
WHERE transactions.user_id = excluded.user_id
  AND (excluded.updated_at > transactions.updated_at
   OR (excluded.updated_at = transactions.updated_at AND excluded.rev > transactions.rev))`;

export async function pushTransactions(userId, items) {
  const applied = [];
  for (const raw of items.slice(0, 500)) {
    const t = sanitizeTx(raw);
    if (!t.id) continue;
    const { meta } = await q(UPSERT, [
      t.id, userId, t.type, t.amount, t.category, t.note, t.project, t.account, t.to_account,
      t.occurred_at, t.created_at, t.updated_at, t.rev, t.deleted, t.source,
    ]);
    if ((meta.changes ?? meta.rows_written ?? 0) > 0) applied.push(t.id);
  }
  return applied;
}

// Incremental pull: everything (incl. soft deletes) newer than the cursor
export async function pullTransactions(userId, since) {
  const { rows } = await q(
    `SELECT ${TX_FIELDS} FROM transactions WHERE user_id = ? AND updated_at > ? ORDER BY updated_at ASC LIMIT 2000`,
    [userId, since]);
  return rows;
}

export async function searchTransactions(userId, p) {
  let sql = `SELECT ${TX_FIELDS} FROM transactions WHERE user_id = ? AND deleted = 0`;
  const binds = [userId];
  const add = (clause, val) => { sql += clause; binds.push(val); };
  if (p.type) add(' AND type = ?', p.type);
  if (p.category) add(' AND category = ?', p.category);
  if (p.project) add(' AND project = ?', p.project);
  if (p.account) add(' AND account = ?', p.account);
  if (p.from) add(' AND occurred_at >= ?', Number(p.from));
  if (p.to) add(' AND occurred_at <= ?', Number(p.to));
  if (p.q) {
    const like = `%${p.q}%`;
    sql += ' AND (note LIKE ? OR category LIKE ? OR project LIKE ?)';
    binds.push(like, like, like);
  }
  sql += ' ORDER BY occurred_at DESC LIMIT 1000';
  const { rows } = await q(sql, binds);
  return rows;
}

export async function getBudgets(userId, month) {
  const { rows } = month
    ? await q('SELECT * FROM budgets WHERE user_id = ? AND month = ?', [userId, month])
    : await q('SELECT * FROM budgets WHERE user_id = ? ORDER BY month DESC LIMIT 120', [userId]);
  return rows;
}

export async function putBudgets(userId, items) {
  for (const b of items) {
    const month = String(b.month || '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) continue;
    await q(
      `INSERT INTO budgets (user_id, month, category, amount, carry_forward, updated_at)
       VALUES (?,?,?,?,?,?)
       ON CONFLICT(user_id, month, category) DO UPDATE SET
         amount=excluded.amount, carry_forward=excluded.carry_forward, updated_at=excluded.updated_at`,
      [userId, month, String(b.category || '').slice(0, 60),
       Math.max(0, Math.round(Number(b.amount) || 0)), b.carry_forward ? 1 : 0, Date.now()]);
  }
}

export async function deleteBudget(userId, month, category) {
  await q('DELETE FROM budgets WHERE user_id = ? AND month = ? AND category = ?',
    [userId, String(month || '').slice(0, 7), String(category || '').slice(0, 60)]);
}

export async function getCategories(userId) {
  const { rows } = await q('SELECT name, icon_svg, color FROM categories WHERE user_id = ? ORDER BY created_at ASC', [userId]);
  return rows;
}

export async function putCategory(userId, { name, icon_svg, color }) {
  name = String(name || '').trim().slice(0, 60);
  if (!name) throw new Error('Category name required');
  await q(
    `INSERT INTO categories (user_id, name, icon_svg, color, created_at)
     VALUES (?,?,?,?,?)
     ON CONFLICT(user_id, name) DO UPDATE SET icon_svg=excluded.icon_svg, color=excluded.color`,
    [userId, name, String(icon_svg || ''), String(color || '#9ca3af').slice(0, 20), Date.now()]);
  return { name, icon_svg: icon_svg || '', color: color || '#9ca3af' };
}

export async function deleteCategory(userId, name) {
  await q('DELETE FROM categories WHERE user_id = ? AND name = ?', [userId, String(name || '').slice(0, 60)]);
}

export async function getAccounts(userId) {
  const { rows } = await q(
    'SELECT name, type, opening_balance, limit_amount FROM accounts WHERE user_id = ? ORDER BY sort_order ASC', [userId]);
  return rows;
}

// The client always sends its whole account list (add/rename/remove all go
// through the same saveAccounts() call), so the simplest correct sync is a
// full replace rather than reconciling a diff — same "one device's write
// wins outright" tradeoff the rest of this app already makes.
export async function putAccounts(userId, items) {
  await q('DELETE FROM accounts WHERE user_id = ?', [userId]);
  const now = Date.now();
  let i = 0;
  for (const a of items) {
    const name = String(a?.name || '').trim().slice(0, 60);
    if (!name) continue;
    await q(
      `INSERT INTO accounts (user_id, name, type, opening_balance, limit_amount, sort_order, updated_at)
       VALUES (?,?,?,?,?,?,?)`,
      [userId, name, String(a.type || 'Other').slice(0, 30), Math.round(Number(a.opening_balance) || 0),
       Math.max(0, Math.round(Number(a.limit_amount) || 0)), i++, now]);
  }
}

export async function getHoldings(userId) {
  const { rows } = await q(
    'SELECT name, kind, opening_balance, current_value, valued_at FROM holdings WHERE user_id = ? ORDER BY sort_order ASC', [userId]);
  return rows;
}

// Same full-replace approach as putAccounts — the client always sends its
// whole holdings list on any add/remove/edit.
export async function putHoldings(userId, items) {
  await q('DELETE FROM holdings WHERE user_id = ?', [userId]);
  const now = Date.now();
  let i = 0;
  for (const h of items) {
    const name = String(h?.name || '').trim().slice(0, 60);
    if (!name) continue;
    await q(
      `INSERT INTO holdings (user_id, name, kind, opening_balance, current_value, valued_at, sort_order, updated_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      [userId, name, String(h.kind || 'Other').slice(0, 30), Math.round(Number(h.opening_balance) || 0),
       Math.round(Number(h.current_value) || 0), Math.round(Number(h.valued_at) || 0), i++, now]);
  }
}

const csvEscape = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function buildCSV(userId) {
  const { rows } = await q(
    `SELECT ${TX_FIELDS} FROM transactions WHERE user_id = ? AND deleted = 0 ORDER BY occurred_at ASC`, [userId]);
  const header = 'Date,Type,Category,Note,Account,To Account,Source,Amount (INR)';
  const lines = rows.map((t) => [
    new Date(Number(t.occurred_at)).toISOString().slice(0, 10),
    t.type, t.category, t.note, t.account, t.to_account, t.source, (t.amount / 100).toFixed(2),
  ].map(csvEscape).join(','));
  return [header, ...lines].join('\n');
}
