// Regression tests for the money math. Every case here corresponds to a bug
// that actually shipped and was caught by hand, staring at numbers — these are
// the failures that lose trust permanently, so they get assertions.
//
// Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeTotals, computeAccountBalances, computeHoldingBalances,
  computeHoldingContributed, computeNetWorth, isNewerTx, groupIndian,
  activeHoldings, shadowedHoldingNames,
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

test('Indian grouping: last three digits, then pairs', () => {
  assert.equal(groupIndian('123'), '123');
  assert.equal(groupIndian('1234'), '1,234');
  assert.equal(groupIndian('123456'), '1,23,456');
  assert.equal(groupIndian('20000000'), '2,00,00,000');
  assert.equal(groupIndian('1234567890'), '1,23,45,67,890');
});

test('Indian grouping: idempotent, so it can run on every keystroke', () => {
  const once = groupIndian('20000000');
  assert.equal(groupIndian(once), once);
});

test('Indian grouping: decimals and part-typed input survive', () => {
  assert.equal(groupIndian('1234.5'), '1,234.5');
  assert.equal(groupIndian('1234.'), '1,234.', 'a trailing dot must not vanish mid-typing');
  assert.equal(groupIndian('.5'), '.5');
  assert.equal(groupIndian('1.2.3'), '1.23', 'a stray second dot is dropped, not the whole entry');
  assert.equal(groupIndian(''), '');
  assert.equal(groupIndian(null), '');
  assert.equal(groupIndian(12345), '12,345', 'numbers, not just strings');
});

// A name shared by an account and a holding made an ordinary account-to-account
// transfer read as an investment everywhere (badge, savings rate, AI data) AND
// double-counted the money: the destination account's balance went up while the
// same-named holding's balance also went up, inflating net worth by the full
// transfer amount out of nothing.
test('net worth: an account and a holding sharing a name must not double-count a transfer', () => {
  const accounts = [
    { name: 'HDFC', type: 'Bank', opening_balance: R(100000) },
    { name: 'Savings', type: 'Bank', opening_balance: 0 },
  ];
  const holdings = [{ name: 'Savings', kind: 'FD', opening_balance: 0, current_value: 0, valued_at: 0 }];
  const live = [tx({ type: 'transfer', amount: R(5000), account: 'HDFC', to_account: 'Savings' })];

  const worth = computeNetWorth(accounts, holdings, live);
  // Money only moved between two places the user owns — net worth cannot change.
  assert.equal(worth.total, R(100000));
});

test('shadowed holdings: the account wins, and the clash is reportable', () => {
  const accounts = [{ name: 'Savings', type: 'Bank', opening_balance: 0 }];
  const holdings = [
    { name: 'savings', kind: 'FD', opening_balance: 0 },   // case-insensitive
    { name: 'Nifty 50', kind: 'Mutual Funds', opening_balance: 0 },
  ];
  assert.deepEqual(activeHoldings(accounts, holdings).map((h) => h.name), ['Nifty 50']);
  assert.deepEqual(shadowedHoldingNames(accounts, holdings), ['savings']);
});

test('net worth: a genuine investment still leaves spendable and lands in invested', () => {
  const accounts = [{ name: 'HDFC', type: 'Bank', opening_balance: R(100000) }];
  const holdings = [{ name: 'Nifty 50', kind: 'Mutual Funds', opening_balance: 0, current_value: 0, valued_at: 0 }];
  const live = [tx({ type: 'transfer', amount: R(5000), account: 'HDFC', to_account: 'Nifty 50' })];

  const worth = computeNetWorth(accounts, holdings, live);
  assert.equal(worth.spendable, R(95000));
  assert.equal(worth.invested, R(5000));
  assert.equal(worth.total, R(100000));
});

// An IOU account is money someone else owes you: a real asset for net worth,
// but not cash you can spend until it comes back. It must land in `owed`,
// never in `spendable` (which drives the runway estimate), and the four
// buckets must still reconcile to the total.
test('net worth: an IOU is an asset but not spendable', () => {
  const accounts = [
    { name: 'HDFC', type: 'Bank', opening_balance: R(50000) },
    { name: 'Lent to Ravi', type: 'IOU', opening_balance: 0 },
    { name: 'Amex', type: 'Credit Card', opening_balance: R(-3000) },
  ];
  // Fronted Ravi's ₹2,000 share of a bill: leaves the bank, becomes owed.
  const live = [tx({ type: 'transfer', amount: R(2000), account: 'HDFC', to_account: 'Lent to Ravi' })];

  const w = computeNetWorth(accounts, [], live);
  assert.equal(w.spendable, R(48000));
  assert.equal(w.owed, R(2000));
  assert.equal(w.dues, R(3000));
  assert.equal(w.total, R(47000));
  assert.equal(w.total, w.spendable + w.invested + w.owed - w.dues);
});

test('withdrawing a holding in full empties it and keeps net worth flat', () => {
  // The mirror of investing: a transfer with the holding on the SOURCE side.
  // Until the entry form offered it, this could not be recorded at all.
  const t0 = 2_000_000_000_000;
  const accounts = [{ name: 'ICICI', type: 'Bank', opening_balance: R(50000) }];
  const holdings = [{
    name: 'NSE IPO', kind: 'Stocks',
    valued_at: t0 - 3600000, current_value: R(14623.42), opening_balance: 0,
  }];
  const invested = tx({ type: 'transfer', amount: R(14280), account: 'ICICI', to_account: 'NSE IPO', occurred_at: t0 - 5 * 86400000 });
  const withdrawn = tx({ type: 'transfer', amount: R(14623.42), account: 'NSE IPO', to_account: 'ICICI', occurred_at: t0 });

  const before = computeNetWorth(accounts, holdings, [invested]);
  assert.equal(computeHoldingBalances(holdings, [invested])['NSE IPO'], R(14623.42));

  const after = computeNetWorth(accounts, holdings, [invested, withdrawn]);
  assert.equal(computeHoldingBalances(holdings, [invested, withdrawn])['NSE IPO'], 0,
    'taking out the full valued amount leaves nothing behind');
  assert.equal(after.spendable, R(50343.42), 'the gain lands in the bank');
  assert.equal(after.invested, 0);
  // Cashing out is not income — the money was already the user's.
  assert.equal(after.total, before.total, 'net worth does not move on a withdrawal');
});

test('a partial withdrawal takes its share of the cost basis with it', () => {
  // 14,280 in, worth 14,623.42 (+2.4%). Taking out half the VALUE must take
  // half the BASIS too. Subtracting the withdrawal's face value instead left
  // the whole gain attached to a shrunken basis and reported 4.9% on the
  // remainder — flattering the investment purely because the denominator got
  // smaller, when nothing about it had changed.
  const t0 = 2_000_000_000_000;
  const holdings = [{
    name: 'NSE IPO', kind: 'Stocks',
    valued_at: t0 - 3600000, current_value: R(14623.42), opening_balance: 0,
  }];
  const invested = tx({ type: 'transfer', amount: R(14280), account: 'ICICI', to_account: 'NSE IPO', occurred_at: t0 - 5 * 86400000 });
  const half = tx({ type: 'transfer', amount: R(7311.71), account: 'NSE IPO', to_account: 'ICICI', occurred_at: t0 });

  const put = computeHoldingContributed(holdings, [invested, half])['NSE IPO'];
  const bal = computeHoldingBalances(holdings, [invested, half])['NSE IPO'];
  assert.equal(put, R(7140), 'half the basis leaves with half the value');
  assert.equal(bal, R(7311.71));
  // The percentage is what the user reads, and it must not move.
  assert.equal(Math.round(((bal - put) / put) * 1000) / 10, 2.4);
});

test('a full withdrawal still lands exactly on zero', () => {
  const t0 = 2_000_000_000_000;
  const holdings = [{ name: 'H', valued_at: t0 - 3600000, current_value: R(14623.42), opening_balance: 0 }];
  const txs = [
    tx({ type: 'transfer', amount: R(14280), account: 'ICICI', to_account: 'H', occurred_at: t0 - 5 * 86400000 }),
    tx({ type: 'transfer', amount: R(14623.42), account: 'H', to_account: 'ICICI', occurred_at: t0 }),
  ];
  assert.equal(computeHoldingContributed(holdings, txs).H, 0);
  assert.equal(computeHoldingBalances(holdings, txs).H, 0);
});

test('apportioning does not flatter a loss-making holding either', () => {
  // Down 20%. Withdrawing part of it must still read -20%, not less.
  const t0 = 2_000_000_000_000, D = 86400000;
  const holdings = [{ name: 'L', valued_at: t0 + D, current_value: R(800), opening_balance: 0 }];
  const txs = [
    tx({ type: 'transfer', amount: R(1000), account: 'B', to_account: 'L', occurred_at: t0 }),
    tx({ type: 'transfer', amount: R(400), account: 'L', to_account: 'B', occurred_at: t0 + 2 * D }),
  ];
  const put = computeHoldingContributed(holdings, txs).L;
  const bal = computeHoldingBalances(holdings, txs).L;
  assert.equal(put, R(500));
  assert.equal(Math.round(((bal - put) / put) * 100), -20);
});

test('basis is order-independent and never goes negative', () => {
  // Sync delivers entries in whatever order it likes, so the result cannot
  // depend on the order they arrive in.
  const t0 = 2_000_000_000_000, D = 86400000;
  const holdings = [{ name: 'H', valued_at: 0, current_value: 0, opening_balance: 0 }];
  const put = tx({ type: 'transfer', amount: R(1000), account: 'B', to_account: 'H', occurred_at: t0 });
  const take = tx({ type: 'transfer', amount: R(500), account: 'H', to_account: 'B', occurred_at: t0 + D });
  assert.equal(computeHoldingContributed(holdings, [put, take]).H,
    computeHoldingContributed(holdings, [take, put]).H);

  // Withdrawing more than it holds empties it rather than going negative.
  const over = tx({ type: 'transfer', amount: R(9999), account: 'H', to_account: 'B', occurred_at: t0 + D });
  assert.equal(computeHoldingContributed(holdings, [put, over]).H, 0);
});

test('a withdrawal counts even when the valuation is dated after it', () => {
  // Cashed out on the 25th, then valued on the 27th. Skipping withdrawals
  // dated before the valuation (the way contributions are skipped) resurrected
  // the entire balance: the app showed money already sitting in the user's
  // bank, and called it pure profit because the basis had correctly gone to
  // zero. A valuation supersedes price movement, not a withdrawal.
  const D = (d) => new Date(2026, 8, d, 12).getTime();
  const holdings = [{ name: 'NSE IPO', valued_at: D(27), current_value: R(14623.42), opening_balance: 0 }];
  const txs = [
    tx({ type: 'transfer', amount: R(14280), account: 'ICICI', to_account: 'NSE IPO', occurred_at: D(22) }),
    tx({ type: 'transfer', amount: R(14623.42), account: 'NSE IPO', to_account: 'SBI', occurred_at: D(25) }),
  ];
  assert.equal(computeHoldingBalances(holdings, txs)['NSE IPO'], 0);
  assert.equal(computeHoldingContributed(holdings, txs)['NSE IPO'], 0);

  // And the answer must not depend on which side of the valuation it fell.
  const earlier = [{ name: 'NSE IPO', valued_at: D(24), current_value: R(14623.42), opening_balance: 0 }];
  assert.equal(computeHoldingBalances(earlier, txs)['NSE IPO'], 0);
});

test('a contribution before a valuation is still absorbed by it', () => {
  // The rule this fix had to preserve: a valuation already accounts for money
  // put in before it, so that contribution must not be added on top.
  const D = (d) => new Date(2026, 8, d, 12).getTime();
  const holdings = [{ name: 'H', valued_at: D(27), current_value: R(14623.42), opening_balance: 0 }];
  const txs = [tx({ type: 'transfer', amount: R(14280), account: 'ICICI', to_account: 'H', occurred_at: D(22) })];
  assert.equal(computeHoldingBalances(holdings, txs).H, R(14623.42), 'not 28,903.42');
});

test('a category on a transfer is a label, never spending', () => {
  // Card bills, rent payouts and money sent home are worth labelling, but a
  // transfer is not spending: the money was already counted when the card was
  // used. Letting a categorised transfer into the totals would double-count
  // every rupee on the statement.
  const D = (d) => new Date(2026, 8, d, 12).getTime();
  const txs = [
    tx({ type: 'expense', amount: R(2000), category: 'Shopping', account: 'ICICI MasterCard', occurred_at: D(5) }),
    tx({
      type: 'transfer', amount: R(2349.04), category: 'Bills & Utilities',
      note: 'MasterCard ICICI Credit Card Bill',
      account: 'SBI Bank', to_account: 'ICICI MasterCard', occurred_at: D(15),
    }),
  ];
  const { exp } = computeTotals(txs);
  assert.equal(exp, R(2000), 'the bill is not spending, however it is labelled');
});
