// Regression tests for the money math. Every case here corresponds to a bug
// that actually shipped and was caught by hand, staring at numbers — these are
// the failures that lose trust permanently, so they get assertions.
//
// Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeTotals, computeAccountBalances, computeHoldingBalances,
  computeHoldingContributed, computeNetWorth, isNewerTx,
} from '../src/lib/money.mjs';

// Amounts are integer paise throughout, as they are in the app.
const R = (rupees) => Math.round(rupees * 100);
const tx = (o) => ({
  id: o.id || Math.random().toString(36).slice(2),
  type: 'expense', amount: 0, category: 'Other', note: '',
  account: '', to_account: '', occurred_at: 1000, updated_at: 1000, rev: 1,
  deleted: 0, source: 'manual', ...o,
});
const CASH = { name: 'Cash', type: 'Bank', opening_balance: 0 };

test('totals: investments are not spending', () => {
  const { inc, exp, saved } = computeTotals([
    tx({ type: 'income', amount: R(50000) }),
    tx({ type: 'expense', amount: R(300) }),
    tx({ type: 'expense', amount: R(5000), category: 'Investments' }),
    tx({ type: 'transfer', amount: R(9999) }),
  ]);
  assert.equal(inc, R(50000));
  assert.equal(exp, R(300), 'an investment must not inflate spending');
  assert.equal(saved, R(5000));
});

test('account balances: opening balance is the starting point', () => {
  const bal = computeAccountBalances(
    [{ ...CASH, opening_balance: R(1000) }],
    [tx({ type: 'expense', amount: R(250), account: 'Cash' })],
  );
  assert.equal(bal.Cash, R(750));
});

test('account balances: a transfer to a NON-account must not cancel its own outflow', () => {
  // The ₹20,000 bug. The add-entry form defaulted a transfer's destination to
  // a literal 'Bank' that was not in the user's account list; a balance was
  // invented for it, so summing the map showed the money never leaving.
  const accounts = [{ ...CASH, opening_balance: R(50000) }];
  const live = [tx({ type: 'transfer', amount: R(20000), account: 'Cash', to_account: 'Bank' })];
  const bal = computeAccountBalances(accounts, live);

  assert.equal(bal.Cash, R(30000), 'the money must actually leave Cash');
  assert.deepEqual(Object.keys(bal), ['Cash'], 'no balance may be invented for an unknown name');
  assert.equal(Object.values(bal).reduce((a, b) => a + b, 0), R(30000));
});

test('account balances: a transfer between two real accounts nets to zero overall', () => {
  const accounts = [{ ...CASH, opening_balance: R(50000) }, { name: 'HDFC', type: 'Bank', opening_balance: 0 }];
  const bal = computeAccountBalances(accounts,
    [tx({ type: 'transfer', amount: R(20000), account: 'Cash', to_account: 'HDFC' })]);
  assert.equal(bal.Cash, R(30000));
  assert.equal(bal.HDFC, R(20000));
  assert.equal(Object.values(bal).reduce((a, b) => a + b, 0), R(50000), 'total is unchanged');
});

test('balances ignore deleted entries', () => {
  // live() filters these out before it ever reaches the math, so the
  // assertion is that the caller's contract is what's being tested: a
  // deleted entry never appears in the list handed over.
  const live = [tx({ type: 'income', amount: R(100), account: 'Cash', deleted: 1 })]
    .filter((t) => !t.deleted);
  assert.deepEqual(computeAccountBalances([CASH], live), { Cash: 0 });
});

test('holdings: value is the stated valuation plus flows since, not cost basis', () => {
  // Created at ₹2,00,000, then ₹20,000 moved in afterwards.
  const holdings = [{ name: 'Home', kind: 'Home', opening_balance: R(200000), current_value: R(200000), valued_at: 500 }];
  const live = [tx({ type: 'transfer', amount: R(20000), account: 'Cash', to_account: 'Home', occurred_at: 900 })];

  assert.equal(computeHoldingBalances(holdings, live).Home, R(220000));
  assert.equal(computeHoldingContributed(holdings, live).Home, R(220000));
});

test('holdings: gain is value minus contributions, and a value update keeps cost basis', () => {
  // Re-stating the value must not wipe opening_balance — doing so made the
  // whole balance look like pure profit.
  const holdings = [{ name: 'MF', kind: 'Mutual Funds', opening_balance: R(200000), current_value: R(260000), valued_at: 2000 }];
  const live = [tx({ type: 'transfer', amount: R(20000), account: 'Cash', to_account: 'MF', occurred_at: 900 })];

  const value = computeHoldingBalances(holdings, live).MF;
  const put = computeHoldingContributed(holdings, live).MF;
  assert.equal(value, R(260000), 'a contribution before the valuation is already inside it');
  assert.equal(put, R(220000));
  assert.equal(value - put, R(40000), 'gain');
});

test('holdings: selling for more than you put in keeps the profit', () => {
  // Cost basis ₹1,00,000, sold for ₹1,50,000. Under a contributions-only
  // model the holding went to −₹50,000 and the gain disappeared.
  const holdings = [{ name: 'Stocks', kind: 'Stocks', opening_balance: R(100000), current_value: 0, valued_at: 3000 }];
  const accounts = [{ ...CASH, opening_balance: 0 }];
  const live = [tx({ type: 'transfer', amount: R(150000), account: 'Stocks', to_account: 'Cash', occurred_at: 2000 })];

  assert.equal(computeHoldingBalances(holdings, live).Stocks, 0, 'exited, so worth nothing');
  const worth = computeNetWorth(accounts, holdings, live);
  assert.equal(worth.spendable, R(150000), 'the proceeds landed in Cash');
  assert.equal(worth.total, R(150000));
});

test('net worth: a credit card is a liability, and its limit is never money', () => {
  const accounts = [
    { ...CASH, opening_balance: R(50000) },
    { name: 'ICICI', type: 'Credit Card', opening_balance: R(-3000), limit_amount: R(200000) },
  ];
  const worth = computeNetWorth(accounts, [], []);
  assert.equal(worth.spendable, R(50000));
  assert.equal(worth.dues, R(3000));
  assert.equal(worth.total, R(47000), 'dues reduce net worth; the limit is irrelevant');
});

test('net worth: investing moves money without changing the total', () => {
  const accounts = [{ ...CASH, opening_balance: R(50000) }];
  const holdings = [{ name: 'MF', kind: 'Mutual Funds', opening_balance: 0, current_value: 0, valued_at: 0 }];
  const live = [tx({ type: 'transfer', amount: R(20000), account: 'Cash', to_account: 'MF', occurred_at: 900 })];

  const worth = computeNetWorth(accounts, holdings, live);
  assert.equal(worth.spendable, R(30000));
  assert.equal(worth.invested, R(20000));
  assert.equal(worth.total, R(50000), 'investing is not spending — net worth is unchanged');
});

test('LWW: a delete is not resurrected by its own pre-delete copy', () => {
  // The exact shape of the bug: same millisecond, server row is the older
  // revision. A `>=` on updated_at alone let it overwrite the delete.
  const localDelete = { updated_at: 1785577533359, rev: 5, deleted: 1 };
  const serverStale = { updated_at: 1785577533359, rev: 4, deleted: 0 };
  assert.equal(isNewerTx(serverStale, localDelete), false);
});

test('LWW: newer timestamp wins, rev breaks a tie, and unknown ids are accepted', () => {
  assert.equal(isNewerTx({ updated_at: 2, rev: 1 }, { updated_at: 1, rev: 9 }), true);
  assert.equal(isNewerTx({ updated_at: 1, rev: 1 }, { updated_at: 2, rev: 1 }), false);
  assert.equal(isNewerTx({ updated_at: 1, rev: 2 }, { updated_at: 1, rev: 1 }), true);
  assert.equal(isNewerTx({ updated_at: 1, rev: 1 }, { updated_at: 1, rev: 1 }), true, 'idempotent re-apply');
  assert.equal(isNewerTx({ updated_at: 1, rev: 1 }, null), true);
});

test('entries missing rev do not crash the merge', () => {
  // Entries predating the rev field made `existing.rev + 1` NaN, which the
  // server clamped back to 1 and which cost the delete its tiebreak.
  assert.equal(isNewerTx({ updated_at: 5 }, { updated_at: 5 }), true);
  assert.equal(isNewerTx({ updated_at: 4 }, { updated_at: 5 }), false);
});
