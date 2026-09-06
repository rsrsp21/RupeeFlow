// The ask assistant lets the model write SQL against the user's own ledger.
// That is the only place in the app where model output reaches the database,
// so the guard rails get assertions: a prompt instruction is not a security
// control, and a regression here would leak one user's ledger to another.
//
// Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSql, buildScopedSql } from '../src/lib/askSql.js';

const rejected = (sql) => assert.equal(validateSql(sql).ok, false, `should reject: ${sql}`);

test('validate: only a single bare SELECT survives', () => {
  assert.equal(validateSql("SELECT SUM(rupees) FROM tx WHERE type='expense'").ok, true);
  rejected('UPDATE tx SET rupees = 0');
  rejected('DROP TABLE users');
  rejected('DELETE FROM tx');
  rejected('');
});

test('validate: no stacked statements or hidden tails', () => {
  rejected('SELECT 1; DELETE FROM transactions');
  rejected('SELECT * FROM tx -- ignore the rest');
  rejected('SELECT * FROM tx /* comment */');
});

test('validate: only the tx view is readable, never the base table', () => {
  // transactions holds EVERY user's rows — reaching it directly is the whole
  // thing this guard exists to prevent.
  rejected('SELECT * FROM transactions');
  rejected('SELECT * FROM users');
  rejected('SELECT * FROM sqlite_master');
  rejected('SELECT * FROM tx JOIN users ON 1=1');
});

test('validate: user_id is not addressable by the model', () => {
  rejected("SELECT * FROM tx WHERE user_id = 'someone-else'");
  rejected('SELECT user_id FROM tx');
});

test('validate: a real item question passes', () => {
  const sql = "SELECT month, SUM(rupees) AS spent FROM tx WHERE lower(note) LIKE '%chicken%' GROUP BY month";
  const r = validateSql(sql);
  assert.equal(r.ok, true);
  assert.match(r.sql, /GROUP BY month/);
});

test('scoping: the user filter is bound by us, outside the model query', () => {
  const scoped = buildScopedSql('SELECT SUM(rupees) FROM tx');
  // The placeholder must sit in OUR wrapper: the model never writes the
  // predicate that decides whose rows these are.
  assert.match(scoped, /WHERE user_id = \? AND deleted = 0/);
  assert.match(scoped, /LIMIT 200/);
});

test('scoping: a tautology in the model query cannot widen it', () => {
  // "OR 1=1" passes the grammar — it must still be powerless, because the
  // scope lives in an outer CTE it cannot reach.
  const scoped = buildScopedSql('SELECT * FROM tx WHERE 1=1');
  const cte = scoped.slice(0, scoped.indexOf('SELECT * FROM ('));
  assert.match(cte, /user_id = \?/);
});

test('scoping: the row cap is applied outside the model query', () => {
  const scoped = buildScopedSql('SELECT * FROM tx LIMIT 999999');
  assert.match(scoped, /\) LIMIT 200$/);
});
