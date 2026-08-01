'use client';
// Ledger — period switcher (Day/Week/Month/Year), period totals + trend,
// deep filters, and date-grouped entries with per-day subtotals.
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, SlidersHorizontal, X, Download, List } from 'lucide-react';
import { useStore } from '@/lib/client/store';
import { CATEGORIES, rupees, toPaise } from '@/lib/client/constants';
import {
  PERIODS, DAY_MS, periodStart, periodEnd, shiftPeriod, periodLabel, bucketsFor, startOfDay,
} from '@/lib/client/period';
import TxItem from '../TxItem';
import TrendBars from '../charts/TrendBars';
import AccountsSummary from '../AccountsSummary';
import SyncBadge from '../SyncBadge';
import SettingsLink from '../SettingsLink';
import { useUI } from '../App';

const SORTS = {
  recent: { label: 'Newest first', fn: (a, b) => b.occurred_at - a.occurred_at },
  oldest: { label: 'Oldest first', fn: (a, b) => a.occurred_at - b.occurred_at },
  high: { label: 'Highest amount', fn: (a, b) => b.amount - a.amount },
  low: { label: 'Lowest amount', fn: (a, b) => a.amount - b.amount },
};

function dayHeading(dayStart) {
  const today = startOfDay();
  if (dayStart === today) return 'Today';
  if (dayStart === today - DAY_MS) return 'Yesterday';
  return new Date(dayStart).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
}

// Which account the ledger is scoped to, remembered across reloads. Kept
// separate from the Dashboard's own key so the two screens can sit on
// different accounts without fighting each other.
const LEDGER_ACCT_KEY = 'rf_ledger_account';

export default function Ledger() {
  const store = useStore();
  const { openExport, setEntryDate, setView } = useUI();
  const [kind, setKind] = useState('day');
  const [start, setStart] = useState(() => periodStart('day'));
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [cat, setCat] = useState('');
  const [account, setAccount] = useState('');
  const [minAmt, setMinAmt] = useState('');
  const [maxAmt, setMaxAmt] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sort, setSort] = useState('recent');
  const [showFilters, setShowFilters] = useState(false);
  const [allTime, setAllTime] = useState(false);

  // A search or a custom date range both mean "ignore the Day/Week/Month/
  // Year tab up top and look across whatever timeline actually matches" —
  // search in particular makes no sense scoped to "today" only, that's not
  // how anyone expects a search box to behave.
  const searching = q.trim().length > 0;
  const hasCustomRange = Boolean(dateFrom || dateTo);
  const overridingTimeline = searching || hasCustomRange;

  const end = periodEnd(kind, start);

  // Browsing a specific day (not "all time", not a week/month/year span —
  // those don't map to one date) sets the day new manual entries should
  // default to instead of always defaulting to right now. Clears itself on
  // unmount so leaving Ledger for another screen doesn't leave it stuck.
  useEffect(() => {
    setEntryDate(kind === 'day' && !allTime ? start : null);
    return () => setEntryDate(null);
  }, [kind, start, allTime, setEntryDate]);

  useEffect(() => {
    const saved = localStorage.getItem(LEDGER_ACCT_KEY);
    if (saved) setAccount(saved);
  }, []);
  // Drop the saved account if it's since been removed, rather than showing
  // a permanently empty ledger scoped to something that no longer exists.
  useEffect(() => {
    if (account && store.accounts.length && !store.accounts.some((a) => a.name === account)) {
      setAccount('');
      localStorage.removeItem(LEDGER_ACCT_KEY);
    }
  }, [account, store.accounts]);
  function changeAccount(v) {
    setAccount(v);
    if (v) localStorage.setItem(LEDGER_ACCT_KEY, v); else localStorage.removeItem(LEDGER_ACCT_KEY);
  }

  function switchKind(k) {
    setKind(k);
    setStart(periodStart(k));
    setAllTime(false);
  }

  const extraFilters = [type, cat, account, minAmt, maxAmt].filter(Boolean).length + (hasCustomRange ? 1 : 0);
  const activeFilters = extraFilters + (q ? 1 : 0);

  function clearFilters() {
    setQ(''); setType(''); setCat(''); changeAccount(''); setMinAmt(''); setMaxAmt(''); setDateFrom(''); setDateTo('');
  }

  // period slice (or all time, or a custom range, or unscoped while searching)
  const periodTx = useMemo(() => {
    const all = store.live();
    if (hasCustomRange) {
      const fromTs = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : -Infinity;
      const toTs = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : Infinity;
      return all.filter((t) => t.occurred_at >= fromTs && t.occurred_at <= toTs);
    }
    if (allTime || searching) return all;
    return all.filter((t) => t.occurred_at >= start && t.occurred_at < end);
  }, [store, store.txs, start, end, allTime, searching, hasCustomRange, dateFrom, dateTo]); // eslint-disable-line react-hooks/exhaustive-deps

  // filters
  const list = useMemo(() => {
    let l = periodTx;
    if (type) l = l.filter((t) => t.type === type);
    if (cat) l = l.filter((t) => t.category === cat);
    if (account) l = l.filter((t) => t.account === account || t.to_account === account);
    const lo = toPaise(minAmt), hi = toPaise(maxAmt);
    if (Number.isFinite(lo)) l = l.filter((t) => t.amount >= lo);
    if (Number.isFinite(hi)) l = l.filter((t) => t.amount <= hi);
    if (q) {
      const s = q.toLowerCase();
      l = l.filter((t) => `${t.note} ${t.category} ${t.account}`.toLowerCase().includes(s));
    }
    return [...l].sort(SORTS[sort].fn);
  }, [periodTx, q, type, cat, account, minAmt, maxAmt, sort]);

  const totals = store.totals(list);
  const net = totals.inc - totals.exp;

  // Avg/day: for Day/Week views the period itself is too short (or exactly a
  // week) to divide meaningfully, so use a trailing 7-day figure instead —
  // for Day that avoids just echoing "Spent" back (period ÷ 1 day). Month/Year
  // keep the normal period-relative average (spent so far ÷ days elapsed),
  // which is already meaningful at that scale.
  const weekAvg = useMemo(() => {
    const since = Date.now() - 7 * DAY_MS;
    const spent = store.live()
      .filter((t) => t.type === 'expense' && t.occurred_at >= since)
      .reduce((s, t) => s + t.amount, 0);
    return Math.round(spent / 7);
  }, [store, store.txs]); // eslint-disable-line react-hooks/exhaustive-deps

  const dayCount = Math.max(1, Math.round((Math.min(end, Date.now()) - start) / DAY_MS));
  const periodAvg = Math.round(totals.exp / dayCount);
  const avgPerDay = kind === 'day' || kind === 'week' ? weekAvg : periodAvg;

  const biggest = list.filter((t) => t.type === 'expense').sort((a, b) => b.amount - a.amount)[0];

  // Running totals up to the END of whatever period is being viewed, so you
  // can read "where did I actually stand at this point" without switching to
  // All — browse to yesterday and it's yesterday's closing position, browse
  // to a past month and it's that month's. Deliberately ignores the search /
  // category / amount filters: a cumulative balance filtered down to, say,
  // just "Food" isn't a balance, it's a category subtotal (already shown in
  // the period card above).
  const cumEnd = allTime || searching ? Infinity
    : hasCustomRange ? (dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : Infinity)
    : end;
  const cumLabel = allTime || searching ? 'now'
    : hasCustomRange ? (dateTo || 'now')
    : periodLabel(kind, start);
  // Net here is spendable money on hand, so it has to be derived the same way
  // store.accountBalances() does — per account, transfer leg by leg. Summing
  // income minus expenses can't work: it ignores transfers entirely, so money
  // moved into a savings holding (or to another account) would never leave
  // the total. Only names that are real accounts count, so a transfer to a
  // holding correctly reduces it.
  const cum = useMemo(() => {
    const upto = store.live().filter((x) => x.occurred_at < cumEnd);
    const scope = account ? store.accounts.filter((a) => a.name === account) : store.accounts;
    const inScope = new Set(scope.map((a) => a.name));
    let net = scope.reduce((s, a) => s + (Number(a.opening_balance) || 0), 0);
    let spent = 0;
    for (const t of upto) {
      const amt = Number(t.amount) || 0;
      if (t.type === 'income') {
        if (inScope.has(t.account)) net += amt;
      } else if (t.type === 'expense') {
        if (inScope.has(t.account)) { net -= amt; spent += amt; }
      } else if (t.type === 'transfer') {
        if (inScope.has(t.account)) net -= amt;
        if (inScope.has(t.to_account)) net += amt;
      }
    }
    return { spent, net };
  }, [store, store.txs, store.accounts, cumEnd, account]); // eslint-disable-line react-hooks/exhaustive-deps

  // trend buckets over the period (expenses) — skipped for "Day": occurred_at's
  // time-of-day is often just whenever the entry was logged, not the real time,
  // so an hour-by-hour breakdown there would be misleading.
  const buckets = useMemo(() => {
    if (allTime || overridingTimeline || kind === 'day') return [];
    return bucketsFor(kind, start).map((b) => ({
      ...b,
      value: periodTx.filter((t) => t.type === 'expense' && t.occurred_at >= b.start && t.occurred_at < b.end)
        .reduce((s, t) => s + t.amount, 0),
    }));
  }, [kind, start, periodTx, allTime]);

  // group by day
  const groups = useMemo(() => {
    const map = new Map();
    for (const t of list.slice(0, 500)) {
      const k = startOfDay(Number(t.occurred_at));
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(t);
    }
    const arr = [...map.entries()];
    if (sort === 'oldest') arr.sort((a, b) => a[0] - b[0]); else arr.sort((a, b) => b[0] - a[0]);
    return arr;
  }, [list, sort]);

  const atNow = start >= periodStart(kind);

  return (
    <section className="view">
      <header className="view-head">
        <div>
          <h2><List size={19} strokeWidth={2} /> Ledger</h2>
          <p className="sub">{list.length} {list.length === 1 ? 'entry' : 'entries'}{activeFilters ? ' · filtered' : ''}</p>
        </div>
        <div className="head-actions">
          <div className="seg period-seg">
            {PERIODS.map((k) => (
              <button key={k} className={kind === k && !allTime ? 'on' : ''} onClick={() => switchKind(k)}>
                {k[0].toUpperCase() + k.slice(1)}
              </button>
            ))}
            <button className={allTime ? 'on' : ''} onClick={() => setAllTime(true)}>All</button>
          </div>
          <button className="btn ghost" onClick={openExport} title="Export"><Download size={15} /></button>
        </div>
        <div className="view-head-utils"><SyncBadge /><SettingsLink /></div>
      </header>

      {/* ── period summary ── */}
      <div className="card period-card">
        <div className="period-nav">
          <button className="day-arrow" disabled={allTime || overridingTimeline} onClick={() => setStart((s) => shiftPeriod(kind, s, -1))} title="Previous">
            <ChevronLeft size={17} strokeWidth={2} />
          </button>
          <motion.div className="period-title" key={hasCustomRange ? 'range' : searching ? 'search' : allTime ? 'all' : `${kind}-${start}`}
            initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.14 }}>
            <div className="day-label">
              {hasCustomRange ? `${dateFrom || 'Start'} → ${dateTo || 'now'}`
                : searching ? 'All time (search)'
                : allTime ? 'All time' : periodLabel(kind, start)}
            </div>
            {!overridingTimeline && !allTime && !atNow && (
              <button className="today-jump" onClick={() => setStart(periodStart(kind))}>Jump to current</button>
            )}
          </motion.div>
          <button className="day-arrow" disabled={allTime || overridingTimeline || atNow} onClick={() => setStart((s) => shiftPeriod(kind, s, 1))} title="Next">
            <ChevronRight size={17} strokeWidth={2} />
          </button>
        </div>

        <div className="stat-row">
          <div className="stat">
            <span className="stat-k">Spent</span>
            <b className="stat-v out">{rupees(totals.exp)}</b>
          </div>
          <div className="stat">
            <span className="stat-k">Received</span>
            <b className="stat-v in">{rupees(totals.inc)}</b>
          </div>
          <div className="stat">
            <span className="stat-k">Net</span>
            <b className="stat-v" style={{ color: net >= 0 ? 'var(--green)' : 'var(--red)' }}>
              {net >= 0 ? '+' : '−'}{rupees(Math.abs(net))}
            </b>
          </div>
          {totals.saved > 0 && (
            <div className="stat">
              <span className="stat-k">Saved</span>
              <b className="stat-v" style={{ color: 'var(--green)' }}>{rupees(totals.saved)}</b>
            </div>
          )}
          {!allTime && !overridingTimeline && (
            <div className="stat">
              <span className="stat-k">Avg / day{(kind === 'day' || kind === 'week') ? ' (7d)' : ''}</span>
              <b className="stat-v">{rupees(avgPerDay)}</b>
            </div>
          )}
        </div>

        {!allTime && !overridingTimeline && kind !== 'day' && buckets.some((b) => b.value > 0) && (
          <div className="period-trend"><TrendBars buckets={buckets} height={52} /></div>
        )}

        {biggest && (
          <p className="period-note">
            Largest: <b>{biggest.note || biggest.category}</b> · {rupees(biggest.amount)}
          </p>
        )}
      </div>

      {/* ── running position up to the end of the viewed period ── */}
      <div className="cum-head">
        <span className="cum-head-label">Running totals</span>
        {store.accounts.length > 1 && (
          <select className="hero-acct-select" value={account} onChange={(e) => changeAccount(e.target.value)}>
            <option value="">All accounts</option>
            {store.accounts.map((a) => <option key={a.name} value={a.name}>{a.name}</option>)}
          </select>
        )}
      </div>
      <div className="grid-2">
        <div className="card cum-card">
          <h3>Net upto {cumLabel}</h3>
          <b className="cum-amt" style={{ color: cum.net >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {cum.net < 0 ? '−' : ''}{rupees(Math.abs(cum.net))}
          </b>
          <p className="muted small">
            Starting balance plus everything received, minus everything paid out, up to this point
            {account ? ` in ${account}` : ' across all accounts'}.
          </p>
        </div>
        <div className="card cum-card">
          <h3>Spent upto {cumLabel}</h3>
          <b className="cum-amt out">{rupees(cum.spent)}</b>
          <p className="muted small">
            Every expense logged on or before this point{account ? ` from ${account}` : ', across all accounts'}.
          </p>
        </div>
      </div>

      <AccountsSummary onManage={() => setView('settings')} />

      {/* ── search + filters ── */}
      <div className="card filters">
        <div className="filter-top">
          <input type="search" className="search" placeholder="Search notes, categories…"
            value={q} onChange={(e) => setQ(e.target.value)} />
          <button className={`btn ghost filter-toggle ${extraFilters ? 'has' : ''}`} onClick={() => setShowFilters((v) => !v)}>
            <SlidersHorizontal size={15} strokeWidth={1.9} />
            Filters{extraFilters ? ` · ${extraFilters}` : ''}
          </button>
        </div>

        <AnimatePresence initial={false}>
          {showFilters && (
            <motion.div className="filter-panel"
              initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}>
              <div className="filter-grid">
                <label><span>Type</span>
                  <select value={type} onChange={(e) => setType(e.target.value)}>
                    <option value="">Any</option><option value="expense">Expense</option>
                    <option value="income">Income</option><option value="transfer">Transfer</option>
                  </select>
                </label>
                <label><span>Category</span>
                  <select value={cat} onChange={(e) => setCat(e.target.value)}>
                    <option value="">Any</option>
                    {[...Object.keys(CATEGORIES), ...store.customCategories.map((c) => c.name)].map((c) => <option key={c}>{c}</option>)}
                  </select>
                </label>
                <label><span>Account</span>
                  <select value={account} onChange={(e) => changeAccount(e.target.value)}>
                    <option value="">Any</option>
                    {store.accounts.map((a) => <option key={a.name} value={a.name}>{a.name}</option>)}
                  </select>
                </label>
                <label><span>Min ₹</span>
                  <input inputMode="decimal" placeholder="0" value={minAmt} onChange={(e) => setMinAmt(e.target.value)} />
                </label>
                <label><span>Max ₹</span>
                  <input inputMode="decimal" placeholder="Any" value={maxAmt} onChange={(e) => setMaxAmt(e.target.value)} />
                </label>
                <label><span>Sort</span>
                  <select value={sort} onChange={(e) => setSort(e.target.value)}>
                    {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </label>
                <label><span>From date</span>
                  <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                </label>
                <label><span>To date</span>
                  <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                </label>
              </div>
              {hasCustomRange && (
                <p className="muted small" style={{ marginTop: 4 }}>
                  A custom date range overrides the Day/Week/Month/Year tabs above.
                </p>
              )}
              {activeFilters > 0 && (
                <button className="btn ghost clear-filters" onClick={clearFilters}>
                  <X size={14} strokeWidth={2} /> Clear all filters
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── grouped entries ── */}
      <div className="card list-card">
        <motion.ul className="tx-list" key={`${kind}-${start}-${allTime}-${sort}`}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.12 }}>
          {groups.length ? groups.map(([k, items]) => {
            const g = store.totals(items);
            return (
              <li key={k}>
                <div className="date-head">
                  <span>{dayHeading(k)}</span>
                  <span>
                    {g.inc > 0 && <b style={{ color: 'var(--green)' }}>+{rupees(g.inc)}</b>}
                    {g.inc > 0 && g.exp > 0 && '  '}
                    {g.exp > 0 && <b style={{ color: 'var(--red)' }}>−{rupees(g.exp)}</b>}
                  </span>
                </div>
                <ul className="tx-list">{items.map((t, i) => <TxItem key={t.id} t={t} index={i} />)}</ul>
              </li>
            );
          }) : (
            <li className="empty">
              {activeFilters ? 'No entries match these filters.' : `No entries in ${allTime ? 'your ledger' : periodLabel(kind, start).toLowerCase()} yet.`}
            </li>
          )}
        </motion.ul>
      </div>
    </section>
  );
}
