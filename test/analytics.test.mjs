// The Insights screen states these numbers as fact, so the edge cases that
// would make it lie confidently get assertions — a part-month compared against
// a whole one, a single outlier read as a trend, a projection from two days of
// data.
//
// Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  monthOverMonth, categoryDeltas, projectMonthEnd, weekdayPattern,
  priceDrift, missingRecurring, outliers, monthlyTrend, spanSummary, categoryBreakdown, categoryHistory, accountSpending, cardHealth,
} from '../src/lib/analytics.mjs';
import { normalizeNote } from '../src/lib/noteMatch.js';

const R = (rupees) => Math.round(rupees * 100);
const at = (y, m, d) => new Date(y, m - 1, d, 12, 0, 0).getTime();
const tx = (o) => ({ type: 'expense', amount: 0, category: 'Other', note: '', occurred_at: 0, ...o });

// Fixed "now" so none of this depends on the wall clock.
const NOW = at(2026, 9, 10);

test('month-over-month compares equal windows, not a part month against a whole one', () => {
  const txs = [
    // 5,000 over the first 10 days of September
    tx({ amount: R(5000), occurred_at: at(2026, 9, 4) }),
    // 4,000 in the same first 10 days of August...
    tx({ amount: R(4000), occurred_at: at(2026, 8, 3) }),
    // ...and 20,000 later in August, which must NOT count. Including it would
    // report a huge "improvement" purely because the month is young.
    tx({ amount: R(20000), occurred_at: at(2026, 8, 27) }),
  ];
  const r = monthOverMonth(txs, NOW);
  assert.equal(r.current, R(5000));
  assert.equal(r.previous, R(4000));
  assert.equal(r.delta, R(1000));
  assert.equal(r.daysCompared, 10);
});

test('category deltas name the category that moved, and flag brand-new ones', () => {
  const txs = [
    tx({ amount: R(3000), category: 'Groceries', occurred_at: at(2026, 9, 2) }),
    tx({ amount: R(1000), category: 'Groceries', occurred_at: at(2026, 8, 2) }),
    tx({ amount: R(900), category: 'Coffee', occurred_at: at(2026, 9, 5) }),
  ];
  const d = categoryDeltas(txs, NOW);
  const groceries = d.find((x) => x.category === 'Groceries');
  assert.equal(groceries.delta, R(2000));
  assert.equal(groceries.pct, 200);
  const coffee = d.find((x) => x.category === 'Coffee');
  assert.equal(coffee.isNew, true, 'no prior spend means new, not a % rise from zero');
  assert.equal(coffee.pct, null);
});

test('projection is withheld in the first days, when it would be absurd', () => {
  const early = [tx({ amount: R(4000), occurred_at: at(2026, 9, 1) })];
  // One big shop on the 1st would otherwise extrapolate to 120,000.
  assert.equal(projectMonthEnd(early, at(2026, 9, 1)).projected, null);

  const steady = [
    tx({ amount: R(3000), occurred_at: at(2026, 9, 2) }),
    tx({ amount: R(3000), occurred_at: at(2026, 9, 8) }),
  ];
  const p = projectMonthEnd(steady, NOW);
  assert.equal(p.spent, R(6000));
  assert.equal(p.projected, R(18000)); // 6000/10 days * 30 days
  assert.equal(p.daysLeft, 20);
});

test('weekday averages divide by that weekday occurrences, not by weeks', () => {
  // Two Saturdays, 1000 each: the average is 1000, not 2000 or 500.
  const txs = [
    tx({ amount: R(1000), occurred_at: at(2026, 9, 5) }),
    tx({ amount: R(1000), occurred_at: at(2026, 8, 29) }),
  ];
  const w = weekdayPattern(txs, NOW);
  assert.equal(w.peak.name, 'Saturday');
  assert.equal(w.peak.avg, R(1000));
});

test('price drift needs repeat readings on both sides before calling a trend', () => {
  // One old and one recent reading is not a trend, however big the jump.
  const thin = [
    tx({ amount: R(100), note: 'chicken 1kg', occurred_at: at(2026, 5, 1) }),
    tx({ amount: R(500), note: 'chicken 1kg', occurred_at: at(2026, 9, 1) }),
  ];
  assert.equal(priceDrift(thin, normalizeNote, NOW).length, 0);

  // Two each side, and quantity phrasing must not fork the item.
  const real = [
    tx({ amount: R(200), note: 'chicken 1kg', occurred_at: at(2026, 5, 1) }),
    tx({ amount: R(200), note: 'chicken 500g', occurred_at: at(2026, 5, 20) }),
    tx({ amount: R(300), note: 'Chicken 1kg', occurred_at: at(2026, 8, 20) }),
    tx({ amount: R(300), note: 'chicken', occurred_at: at(2026, 9, 1) }),
  ];
  const d = priceDrift(real, normalizeNote, NOW);
  assert.equal(d.length, 1);
  assert.equal(d[0].pct, 50);
});

test('missing recurring flags an overdue habit, not a one-off or a fresh one', () => {
  // Paid every month for four months, then nothing this month.
  const txs = [
    tx({ amount: R(500), note: 'Netflix', occurred_at: at(2026, 5, 5) }),
    tx({ amount: R(500), note: 'Netflix', occurred_at: at(2026, 6, 5) }),
    tx({ amount: R(500), note: 'Netflix', occurred_at: at(2026, 7, 5) }),
    tx({ amount: R(500), note: 'Netflix', occurred_at: at(2026, 8, 5) }),
    // Seen twice only — not established enough to call missing.
    tx({ amount: R(900), note: 'Gym', occurred_at: at(2026, 7, 5) }),
    tx({ amount: R(900), note: 'Gym', occurred_at: at(2026, 8, 5) }),
  ];
  const m = missingRecurring(txs, normalizeNote, NOW);
  assert.equal(m.length, 1);
  assert.equal(m[0].item, 'Netflix');
  assert.equal(m[0].typical, R(500));
});

test('missing recurring stays quiet once the item is paid this month', () => {
  const txs = [
    tx({ amount: R(500), note: 'Netflix', occurred_at: at(2026, 6, 5) }),
    tx({ amount: R(500), note: 'Netflix', occurred_at: at(2026, 7, 5) }),
    tx({ amount: R(500), note: 'Netflix', occurred_at: at(2026, 8, 5) }),
    tx({ amount: R(500), note: 'Netflix', occurred_at: at(2026, 9, 5) }),
  ];
  assert.equal(missingRecurring(txs, normalizeNote, NOW).length, 0);
});

test('outliers are judged per category, so rent is not flagged for being rent', () => {
  const txs = [
    // Rent is always large — normal for its own category.
    ...[6, 7, 8, 9].map((m) => tx({ amount: R(20000), category: 'Rent', occurred_at: at(2026, m, 1) })),
    // Coffee is small, so one 900 among 100s is the real anomaly.
    ...[1, 2, 3].map((d) => tx({ amount: R(100), category: 'Coffee', occurred_at: at(2026, 9, d) })),
    tx({ amount: R(900), category: 'Coffee', note: 'Cafe splurge', occurred_at: at(2026, 9, 6) }),
  ];
  const o = outliers(txs, NOW);
  assert.equal(o.length, 1);
  assert.equal(o[0].category, 'Coffee');
  assert.equal(o[0].note, 'Cafe splurge');
});

test('monthly trend returns a full oldest-first run, gaps included', () => {
  const txs = [
    tx({ type: 'income', amount: R(50000), occurred_at: at(2026, 9, 1) }),
    tx({ amount: R(20000), occurred_at: at(2026, 9, 3) }),
    tx({ amount: R(10000), occurred_at: at(2026, 7, 3) }),
  ];
  const t = monthlyTrend(txs, NOW, 6);
  assert.equal(t.length, 6);
  assert.equal(t[t.length - 1].key, '2026-09');
  assert.equal(t[t.length - 1].net, R(30000));
  // A month with no entries still appears, so the chart keeps its shape.
  assert.equal(t[t.length - 2].net, 0);
});

test('outliers report the sample their "typical" was measured over', () => {
  // "3x your typical" is an assertion the user cannot check unless the screen
  // says what typical was measured across — so the sample travels with it.
  const txs = [
    ...[1, 2, 3, 4].map((d) => tx({ amount: R(100), category: 'Coffee', occurred_at: at(2026, 9, d) })),
    tx({ amount: R(900), category: 'Coffee', note: 'Splurge', occurred_at: at(2026, 9, 6) }),
  ];
  const [o] = outliers(txs, NOW);
  assert.equal(o.median, R(100));
  assert.equal(o.sampleSize, 5, 'sample is that category\'s entries in the window');
  assert.equal(o.windowDays, 90);
  assert.equal(o.times, 9);
});

test('a past month is analysed at its own end, not at today', () => {
  // The Insights month picker anchors to the last instant of the chosen
  // month. Anchoring to "now" instead would fold later entries into a
  // finished month and compare it against the wrong window.
  const txs = [
    tx({ amount: R(5000), category: 'Shopping', occurred_at: at(2026, 8, 14) }),
    tx({ amount: R(3000), category: 'Shopping', occurred_at: at(2026, 7, 14) }),
    // September spending must not appear in an August view.
    tx({ amount: R(9000), category: 'Shopping', occurred_at: at(2026, 9, 4) }),
  ];
  const endOfAugust = new Date(2026, 8, 1).getTime() - 1;
  const aug = monthOverMonth(txs, endOfAugust);
  assert.equal(aug.current, R(5000), 'August total excludes September');
  assert.equal(aug.previous, R(3000), 'compared against July');
  assert.equal(aug.daysCompared, 31, 'a finished month is compared whole');

  // And a completed month has no meaningful pace left to project.
  assert.equal(projectMonthEnd(txs, endOfAugust).spent, R(5000));
});

test('a span is compared against an equally long span, not a single month', () => {
  // Three months at 1,000/month against three earlier months at 500/month.
  // Comparing the span against just the month before would report +100%
  // against 500 rather than +100% against 1,500.
  const txs = [
    ...[7, 8, 9].map((m) => tx({ amount: R(1000), category: 'Rent', occurred_at: at(2026, m, 2) })),
    ...[4, 5, 6].map((m) => tx({ amount: R(500), category: 'Rent', occurred_at: at(2026, m, 2) })),
  ];
  const s = spanSummary(txs, NOW, 3, NOW);
  assert.equal(s.expense, R(3000));
  assert.equal(s.prevExpense, R(1500), 'baseline covers three months, not one');
  assert.equal(s.pct, 100);
});

test('a span reports the biggest category even when it did not change', () => {
  // Rent is flat across both windows, so it has no delta — but it is still
  // far and away the largest line, and omitting it would be absurd.
  const txs = [
    ...[4, 5, 6, 7, 8, 9].map((m) => tx({ amount: R(20000), category: 'Rent', occurred_at: at(2026, m, 2) })),
    tx({ amount: R(900), category: 'Coffee', occurred_at: at(2026, 9, 3) }),
  ];
  const s = spanSummary(txs, NOW, 3, NOW);
  assert.equal(s.topCategory.category, 'Rent');
  assert.equal(s.cats.some((c) => c.category === 'Rent'), false, 'flat rent is not "what moved"');
});

test('a running span averages over months elapsed, not months requested', () => {
  // Asking for 12 months when only 3 have data must not divide by 12 and
  // report a monthly rate a quarter of the truth.
  const txs = [7, 8, 9].map((m) => tx({ amount: R(3000), category: 'Rent', occurred_at: at(2026, m, 2) }));
  const s = spanSummary(txs, NOW, 3, NOW);
  assert.equal(s.monthsElapsed, 3);
  assert.equal(s.avgPerMonth, R(3000));
  // And paise stay integers — an average is where a fraction creeps in.
  assert.equal(Number.isInteger(s.avgPerMonth), true);
});

test('a span carries income, saving and what was kept', () => {
  const txs = [
    tx({ type: 'income', amount: R(80000), category: 'Salary', occurred_at: at(2026, 9, 1) }),
    tx({ type: 'transfer', amount: R(20000), to_account: 'Savings', occurred_at: at(2026, 9, 1) }),
    tx({ amount: R(30000), category: 'Rent', occurred_at: at(2026, 9, 2) }),
  ];
  const s = spanSummary(txs, NOW, 3, NOW);
  assert.equal(s.income, R(80000));
  assert.equal(s.invested, R(20000));
  assert.equal(s.net, R(50000), 'kept = income minus expenses');
  assert.equal(s.savingsRate, 25);
});

test('the breakdown keeps steady categories, which "what moved" drops', () => {
  // Food & Dining is identical in both windows. A delta-only list omits it
  // entirely — the category is invisible *because* it is consistent, which
  // is the wrong answer to "where does my money go".
  const txs = [
    ...[8, 9].map((m) => tx({ amount: R(6000), category: 'Food & Dining', occurred_at: at(2026, m, 4) })),
    tx({ amount: R(9000), category: 'Groceries', occurred_at: at(2026, 9, 6) }),
    tx({ amount: R(3000), category: 'Groceries', occurred_at: at(2026, 8, 6) }),
  ];
  const b = categoryBreakdown(txs, at(2026, 9, 1), at(2026, 9, 30), at(2026, 8, 1), at(2026, 8, 31));
  const food = b.rows.find((r) => r.category === 'Food & Dining');
  assert.ok(food, 'a flat category still appears');
  assert.equal(food.delta, 0);
  // ...and it is absent from the delta-only view, which is why this exists.
  assert.equal(categoryDeltas(txs, NOW).some((c) => c.category === 'Food & Dining'), false);
});

test('breakdown shares are of the window total and sum to 100', () => {
  const txs = [
    tx({ amount: R(7500), category: 'Rent', occurred_at: at(2026, 9, 2) }),
    tx({ amount: R(2500), category: 'Groceries', occurred_at: at(2026, 9, 6) }),
  ];
  const b = categoryBreakdown(txs, at(2026, 9, 1), at(2026, 9, 30));
  assert.equal(b.total, R(10000));
  assert.equal(b.rows[0].share, 75);
  assert.equal(b.rows[1].share, 25);
  assert.equal(b.rows.reduce((s2, r) => s2 + r.share, 0), 100);
});

test('breakdown is ranked by spend, biggest first', () => {
  const txs = [
    tx({ amount: R(100), category: 'Coffee', occurred_at: at(2026, 9, 2) }),
    tx({ amount: R(9000), category: 'Rent', occurred_at: at(2026, 9, 2) }),
    tx({ amount: R(500), category: 'Fuel', occurred_at: at(2026, 9, 2) }),
  ];
  const b = categoryBreakdown(txs, at(2026, 9, 1), at(2026, 9, 30));
  assert.deepEqual(b.rows.map((r) => r.category), ['Rent', 'Fuel', 'Coffee']);
});

test('budget history separates a monthly habit from a one-off', () => {
  // Both total the same over six months. A blended total cannot tell them
  // apart, but only one of them is a budget.
  const txs = [
    ...[3, 4, 5, 6, 7, 8].map((m) => tx({ amount: R(1000), category: 'Groceries', occurred_at: at(2026, m, 6) })),
    tx({ amount: R(6000), category: 'Travel', occurred_at: at(2026, 5, 20) }),
  ];
  const h = categoryHistory(txs, NOW, 6);
  const groceries = h.find((c) => c.category === 'Groceries');
  const travel = h.find((c) => c.category === 'Travel');
  assert.equal(groceries.months_active, 6);
  assert.equal(groceries.every_month, true, 'seen every month = a fixed commitment');
  assert.equal(travel.months_active, 1, 'one month in six is occasional, not monthly');
  assert.equal(travel.every_month, false);
});

test('budget history anchors on the median, so one spike cannot raise a budget', () => {
  // Five months at 6,000 and one festival month at 18,000. The mean is
  // dragged to 8,000; budgeting on that would permanently overshoot.
  const txs = [
    ...[3, 4, 5, 6, 7].map((m) => tx({ amount: R(6000), category: 'Groceries', occurred_at: at(2026, m, 6) })),
    tx({ amount: R(18000), category: 'Groceries', occurred_at: at(2026, 8, 6) }),
  ];
  const [g] = categoryHistory(txs, NOW, 6);
  assert.equal(g.median_rupees, 6000);
  assert.equal(g.mean_rupees, 8000, 'the mean is the misleading one');
  assert.equal(g.volatility, 'high', 'and the swing is flagged rather than hidden');
});

test('budget history excludes the current part-month', () => {
  // Counting a part-month would drag every average down and make the
  // suggested budgets quietly too tight.
  const txs = [
    ...[3, 4, 5, 6, 7, 8].map((m) => tx({ amount: R(5000), category: 'Rent', occurred_at: at(2026, m, 2) })),
    tx({ amount: R(200), category: 'Rent', occurred_at: at(2026, 9, 2) }),
  ];
  const [r] = categoryHistory(txs, NOW, 6);
  assert.equal(r.median_rupees, 5000);
  assert.equal(r.by_month.some((m) => m.month === '2026-09'), false);
});

const ACCTS = [
  { name: 'HDFC', type: 'Bank', limit_amount: 0 },
  { name: 'Amex', type: 'Credit Card', limit_amount: R(200000) },
  { name: 'ICICI Card', type: 'Credit Card', limit_amount: R(50000) },
];

test('account spending ignores transfers between your own accounts', () => {
  // Paying a card from a bank account is not spending. Counting it would
  // make every account that funds another look wildly expensive, and would
  // double-count the original purchase.
  const txs = [
    tx({ amount: R(20000), account: 'HDFC', occurred_at: at(2026, 9, 2) }),
    { type: 'transfer', amount: R(50000), account: 'HDFC', to_account: 'Amex',
      category: 'Other', note: '', occurred_at: at(2026, 9, 8) },
  ];
  const rows = accountSpending(txs, ACCTS, at(2026, 9, 1), NOW, at(2026, 8, 1), at(2026, 8, 10));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].amount, R(20000));
});

test('account spending shares are of the window and identify cards', () => {
  const txs = [
    tx({ amount: R(7500), account: 'HDFC', occurred_at: at(2026, 9, 2) }),
    tx({ amount: R(2500), account: 'Amex', occurred_at: at(2026, 9, 4) }),
  ];
  const rows = accountSpending(txs, ACCTS, at(2026, 9, 1), NOW);
  assert.equal(rows[0].share, 75);
  assert.equal(rows[0].isCard, false);
  assert.equal(rows[1].share, 25);
  assert.equal(rows[1].isCard, true, 'a card is flagged so it can be shown differently');
});

test('card health flips the sign on what is owed and bands utilisation', () => {
  // A card balance is negative when money is owed; reporting a negative
  // "owed" figure would be nonsense.
  const balances = { Amex: R(-42000), 'ICICI Card': R(-38000) };
  // Sorted by amount owed, so Amex (42,000) precedes ICICI (38,000) —
  // utilisation is the riskier signal, but the debt is the bigger number.
  const [amex, icici] = cardHealth(ACCTS, balances, [], NOW);
  assert.equal(amex.account, 'Amex', 'biggest debt first');
  assert.equal(icici.account, 'ICICI Card');
  assert.equal(icici.owed, R(38000));
  assert.equal(icici.utilPct, 76);
  assert.equal(icici.status, 'high');
  assert.equal(icici.available, R(12000));
  assert.equal(amex.utilPct, 21);
  assert.equal(amex.status, 'ok');
});

test('a card with no limit set reports unknown rather than guessing', () => {
  const accts = [{ name: 'NoLimit', type: 'Credit Card', limit_amount: 0 }];
  const [c] = cardHealth(accts, { NoLimit: R(-5000) }, [], NOW);
  assert.equal(c.owed, R(5000));
  assert.equal(c.utilPct, null);
  assert.equal(c.status, 'unknown');
});
