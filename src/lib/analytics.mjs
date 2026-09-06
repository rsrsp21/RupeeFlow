// Locally-computed insights for the Insights screen.
//
// Everything interesting on that screen used to wait on a Gemini call, so
// before one finished the page said almost nothing, and after one the user had
// to take the model's word for it. These are deterministic: same ledger, same
// answer, no API call, no cost, and every figure is checkable against the
// user's own entries.
//
// Amounts are integer paise in and out, matching the rest of the app. Every
// function takes an explicit `now` so behaviour is testable rather than
// dependent on the wall clock.

const DAY = 86400000;
const monthKeyOf = (ts) => {
  const d = new Date(Number(ts));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const startOfMonthAt = (ts) => { const d = new Date(ts); return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); };
const isExpense = (t) => t.type === 'expense';
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;

// Spending this calendar month vs the SAME NUMBER OF DAYS last month.
// Comparing a part-month against a whole previous month is the classic way to
// congratulate someone on the 3rd for spending less, so the baseline window is
// truncated to the same elapsed days.
export function monthOverMonth(txs, now = Date.now()) {
  const thisStart = startOfMonthAt(now);
  const cur = new Date(thisStart);
  const dayOfMonth = new Date(now).getDate();
  const prevStart = new Date(cur.getFullYear(), cur.getMonth() - 1, 1).getTime();
  const prevCut = prevStart + dayOfMonth * DAY;

  let current = 0, previous = 0;
  for (const t of txs) {
    if (!isExpense(t)) continue;
    const at = Number(t.occurred_at);
    if (at >= thisStart && at <= now) current += t.amount;
    else if (at >= prevStart && at < prevCut) previous += t.amount;
  }
  const delta = current - previous;
  return {
    current, previous, delta,
    pct: previous > 0 ? Math.round((delta / previous) * 1000) / 10 : null,
    daysCompared: dayOfMonth,
  };
}

// Per-category movement over that same fair window. This is what turns
// "you spent more" into "you spent more on Groceries" — the only version
// anyone can actually act on.
export function categoryDeltas(txs, now = Date.now(), limit = 5) {
  const thisStart = startOfMonthAt(now);
  const cur = new Date(thisStart);
  const dayOfMonth = new Date(now).getDate();
  const prevStart = new Date(cur.getFullYear(), cur.getMonth() - 1, 1).getTime();
  const prevCut = prevStart + dayOfMonth * DAY;

  const a = {}, b = {};
  for (const t of txs) {
    if (!isExpense(t)) continue;
    const at = Number(t.occurred_at);
    if (at >= thisStart && at <= now) a[t.category] = (a[t.category] || 0) + t.amount;
    else if (at >= prevStart && at < prevCut) b[t.category] = (b[t.category] || 0) + t.amount;
  }
  return [...new Set([...Object.keys(a), ...Object.keys(b)])]
    .map((category) => {
      const current = a[category] || 0, previous = b[category] || 0;
      return {
        category, current, previous, delta: current - previous,
        pct: previous > 0 ? Math.round(((current - previous) / previous) * 1000) / 10 : null,
        isNew: previous === 0 && current > 0,
      };
    })
    .filter((c) => c.delta !== 0)
    .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta))
    .slice(0, limit);
}

// Projected month-end spend at the current pace. Deliberately naive linear
// extrapolation, and labelled as a projection in the UI — it is an early
// warning, not a forecast. Suppressed in the first days of a month, when a
// single grocery run extrapolates to something absurd.
export function projectMonthEnd(txs, now = Date.now()) {
  const thisStart = startOfMonthAt(now);
  const d = new Date(now);
  const dayOfMonth = d.getDate();
  const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  let spent = 0;
  for (const t of txs) {
    if (!isExpense(t)) continue;
    const at = Number(t.occurred_at);
    if (at >= thisStart && at <= now) spent += t.amount;
  }
  if (dayOfMonth < 3 || spent === 0) {
    return { spent, projected: null, daysLeft: daysInMonth - dayOfMonth, daysInMonth };
  }
  return {
    spent,
    projected: Math.round((spent / dayOfMonth) * daysInMonth),
    daysLeft: daysInMonth - dayOfMonth,
    daysInMonth,
  };
}

// Which weekday actually costs the most. Weekend overspending is invisible in
// a monthly total and obvious here.
export function weekdayPattern(txs, now = Date.now(), days = 90) {
  const cut = now - days * DAY;
  const totals = new Array(7).fill(0);
  const seen = Array.from({ length: 7 }, () => new Set());
  for (const t of txs) {
    if (!isExpense(t)) continue;
    const at = Number(t.occurred_at);
    if (at < cut || at > now) continue;
    const d = new Date(at);
    totals[d.getDay()] += t.amount;
    seen[d.getDay()].add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
  }
  // Averaged per occurrence of that weekday rather than per week: a window
  // that doesn't divide evenly into weeks would otherwise favour whichever
  // weekday it happens to contain one more of.
  const avg = totals.map((sum, i) => (seen[i].size ? Math.round(sum / seen[i].size) : 0));
  const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const top = avg.indexOf(Math.max(...avg));
  return {
    perDay: names.map((name, i) => ({ name, short: name.slice(0, 3), avg: avg[i], total: totals[i] })),
    peak: Math.max(...avg) > 0 ? { name: names[top], avg: avg[top] } : null,
  };
}

// Items whose typical price has moved: recent half of the window against the
// older half. `normalize` is the app's normalizeNote, injected so this module
// stays pure and so "chicken 1kg" / "chicken 500g" collapse to one item.
export function priceDrift(txs, normalize, now = Date.now(), days = 180, limit = 5) {
  const cut = now - days * DAY;
  const mid = now - (days / 2) * DAY;
  const items = new Map();
  for (const t of txs) {
    if (!isExpense(t) || !t.note) continue;
    const at = Number(t.occurred_at);
    if (at < cut || at > now) continue;
    const k = normalize(t.note);
    if (!k) continue;
    if (!items.has(k)) items.set(k, { label: t.note.trim(), category: t.category, old: [], recent: [], last: 0 });
    const it = items.get(k);
    (at >= mid ? it.recent : it.old).push(t.amount);
    if (at > it.last) { it.last = at; it.label = t.note.trim(); }
  }
  const out = [];
  for (const it of items.values()) {
    // At least two readings each side, or one outlier reads as a trend —
    // the fastest way to lose trust in a screen like this.
    if (it.old.length < 2 || it.recent.length < 2) continue;
    const before = mean(it.old), after = mean(it.recent);
    if (before <= 0) continue;
    const pct = Math.round(((after - before) / before) * 1000) / 10;
    if (Math.abs(pct) < 10) continue; // below this it is just noise
    out.push({ item: it.label, category: it.category, before: Math.round(before), after: Math.round(after), pct });
  }
  return out.sort((x, y) => Math.abs(y.pct) - Math.abs(x.pct)).slice(0, limit);
}

// A recurring commitment that has not appeared when it usually would — a
// missed bill, or a subscription that quietly renewed on another card.
export function missingRecurring(txs, normalize, now = Date.now(), limit = 4) {
  const items = new Map();
  for (const t of txs) {
    if (!isExpense(t) || !t.note) continue;
    const k = normalize(t.note);
    if (!k) continue;
    if (!items.has(k)) items.set(k, { label: t.note.trim(), category: t.category, months: new Set(), last: 0, amounts: [] });
    const it = items.get(k);
    it.months.add(monthKeyOf(t.occurred_at));
    it.amounts.push(t.amount);
    if (Number(t.occurred_at) > it.last) { it.last = Number(t.occurred_at); it.label = t.note.trim(); }
  }
  const thisMonth = monthKeyOf(now);
  const out = [];
  for (const it of items.values()) {
    // Three months running is a habit; two could be coincidence.
    if (it.months.size < 3 || it.months.has(thisMonth)) continue;
    const daysSince = Math.round((now - it.last) / DAY);
    // Monthly-ish and overdue. Past ~70 days it is abandoned, not missing.
    if (daysSince < 33 || daysSince > 70) continue;
    out.push({
      item: it.label, category: it.category, daysSince,
      typical: Math.round(mean(it.amounts)),
      monthsSeen: it.months.size,
    });
  }
  return out.sort((x, y) => y.typical - x.typical).slice(0, limit);
}

// Unusually large entries, judged against their own category's norm — ₹5,000
// is routine for Rent and alarming for Coffee, so one global threshold is
// useless. Median, not mean, so a spike can't raise the bar enough to hide
// the next one.
export function outliers(txs, now = Date.now(), days = 90, limit = 5) {
  const cut = now - days * DAY;
  const byCat = {};
  for (const t of txs) {
    if (!isExpense(t)) continue;
    const at = Number(t.occurred_at);
    if (at < cut || at > now) continue;
    (byCat[t.category] ||= []).push(t);
  }
  const out = [];
  for (const [category, list] of Object.entries(byCat)) {
    if (list.length < 4) continue; // too few entries to have a norm at all
    const sorted = list.map((t) => t.amount).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    if (median <= 0) continue;
    for (const t of list) {
      if (t.amount >= median * 3) {
        out.push({
          note: t.note || category, category, amount: t.amount, median,
          times: Math.round((t.amount / median) * 10) / 10,
          daysAgo: Math.round((now - Number(t.occurred_at)) / DAY),
          // Surfaced so the UI can say what "typical" was measured over —
          // an unexplained benchmark is just an assertion the user has no
          // way to check.
          sampleSize: list.length, windowDays: days,
        });
      }
    }
  }
  return out.sort((x, y) => y.amount - x.amount).slice(0, limit);
}

// Rolling monthly income/expense/net, oldest first — the shape of whether
// things are improving, which no single month can show.
export function monthlyTrend(txs, now = Date.now(), months = 6) {
  const base = new Date(now);
  const out = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    const start = d.getTime();
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
    let inc = 0, exp = 0;
    for (const t of txs) {
      const at = Number(t.occurred_at);
      if (at < start || at >= end) continue;
      if (t.type === 'income') inc += t.amount;
      else if (t.type === 'expense') exp += t.amount;
    }
    out.push({
      key: monthKeyOf(start),
      label: d.toLocaleDateString('en-IN', { month: 'short' }),
      income: inc, expense: exp, net: inc - exp,
    });
  }
  return out;
}

// Spending across an arbitrary span of whole months, against the equally-long
// span immediately before it. The month functions above cannot answer "how was
// this quarter" or "how was last year" — a span needs its own like-for-like
// baseline, and comparing 3 months against 1 would be meaningless.
//
// `endTs` is the last instant of the final month in the span; `months` is how
// many months the span covers. A span that is still running (the current
// month) is compared on elapsed days, so a part-period is never measured
// against a whole one — the same fairness rule the monthly view uses.
export function spanSummary(txs, endTs, months, now = Date.now()) {
  const end = new Date(endTs);
  // First instant of the span: `months` back from the month `end` sits in.
  const startD = new Date(end.getFullYear(), end.getMonth() - (months - 1), 1);
  const start = startD.getTime();
  const prevStart = new Date(startD.getFullYear(), startD.getMonth() - months, 1).getTime();

  // If the span runs to the present its final month is incomplete, so the
  // baseline is truncated by the same elapsed time rather than taking the
  // whole earlier span.
  const liveEnd = Math.min(endTs, now);
  const elapsed = liveEnd - start;
  const prevEnd = Math.min(prevStart + elapsed, start - 1);

  let income = 0, expense = 0, invested = 0, prevExpense = 0, count = 0;
  const byCat = {}, prevByCat = {};
  for (const t of txs) {
    const ts = Number(t.occurred_at);
    if (ts >= start && ts <= liveEnd) {
      if (t.type === 'income') income += t.amount;
      else if (t.type === 'expense') {
        expense += t.amount; count++;
        byCat[t.category] = (byCat[t.category] || 0) + t.amount;
      } else if (t.type === 'transfer') invested += t.amount;
    } else if (ts >= prevStart && ts <= prevEnd) {
      if (t.type === 'expense') {
        prevExpense += t.amount;
        prevByCat[t.category] = (prevByCat[t.category] || 0) + t.amount;
      }
    }
  }

  const allCats = [...new Set([...Object.keys(byCat), ...Object.keys(prevByCat)])]
    .map((category) => {
      const current = byCat[category] || 0, previous = prevByCat[category] || 0;
      return {
        category, current, previous, delta: current - previous,
        pct: previous > 0 ? Math.round(((current - previous) / previous) * 1000) / 10 : null,
        isNew: previous === 0 && current > 0,
      };
    });
  // "What moved" wants only categories that changed; "biggest category" wants
  // the largest by spend whether it moved or not — a steady rent is still the
  // biggest line, and dropping it because it did not change would be absurd.
  const cats = allCats
    .filter((c) => c.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const spentCats = allCats.filter((c) => c.current > 0)
    .sort((a, b) => b.current - a.current);

  // Average per month over the months actually elapsed, so a running span
  // reports a real monthly rate rather than dividing by months it hasn't
  // reached yet.
  const monthsElapsed = Math.max(1, Math.min(months,
    (new Date(liveEnd).getFullYear() - startD.getFullYear()) * 12
    + (new Date(liveEnd).getMonth() - startD.getMonth()) + 1));

  return {
    start, end: liveEnd, months, monthsElapsed,
    income, expense, invested, count,
    prevExpense, delta: expense - prevExpense,
    pct: prevExpense > 0 ? Math.round(((expense - prevExpense) / prevExpense) * 1000) / 10 : null,
    net: income - expense,
    // Paise are integers everywhere else in the app; an average is the one
    // place a fraction can creep in and render as "Rs40,000.01".
    avgPerMonth: Math.round(expense / monthsElapsed),
    savingsRate: income > 0 ? Math.round((invested / income) * 1000) / 10 : null,
    cats: cats.slice(0, 6),
    topCategory: spentCats[0] || null,
  };
}
