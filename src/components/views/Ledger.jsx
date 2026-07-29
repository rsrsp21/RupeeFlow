'use client';
// Ledger — period switcher (Day/Week/Month/Year), period totals + trend,
// deep filters, and date-grouped entries with per-day subtotals.
import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, SlidersHorizontal, X, Download } from 'lucide-react';
import { useStore } from '@/lib/client/store';
import { CATEGORIES, rupees, toPaise } from '@/lib/client/constants';
import {
  PERIODS, DAY_MS, periodStart, periodEnd, shiftPeriod, periodLabel, bucketsFor, startOfDay,
} from '@/lib/client/period';
import TxItem from '../TxItem';
import TrendBars from '../charts/TrendBars';
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

export default function Ledger() {
  const store = useStore();
  const { openExport } = useUI();
  const [kind, setKind] = useState('day');
  const [start, setStart] = useState(() => periodStart('day'));
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [cat, setCat] = useState('');
  const [account, setAccount] = useState('');
  const [minAmt, setMinAmt] = useState('');
  const [maxAmt, setMaxAmt] = useState('');
  const [sort, setSort] = useState('recent');
  const [showFilters, setShowFilters] = useState(false);
  const [allTime, setAllTime] = useState(false);

  const end = periodEnd(kind, start);

  function switchKind(k) {
    setKind(k);
    setStart(periodStart(k));
    setAllTime(false);
  }

  const extraFilters = [type, cat, account, minAmt, maxAmt].filter(Boolean).length;
  const activeFilters = extraFilters + (q ? 1 : 0);

  function clearFilters() {
    setQ(''); setType(''); setCat(''); setAccount(''); setMinAmt(''); setMaxAmt('');
  }

  // period slice (or all time)
  const periodTx = useMemo(() => {
    const all = store.live();
    return allTime ? all : all.filter((t) => t.occurred_at >= start && t.occurred_at < end);
  }, [store, store.txs, start, end, allTime]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // trend buckets over the period (expenses) — skipped for "Day": occurred_at's
  // time-of-day is often just whenever the entry was logged, not the real time,
  // so an hour-by-hour breakdown there would be misleading.
  const buckets = useMemo(() => {
    if (allTime || kind === 'day') return [];
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
          <h2>Ledger</h2>
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
      </header>

      {/* ── period summary ── */}
      <div className="card period-card">
        <div className="period-nav">
          <button className="day-arrow" disabled={allTime} onClick={() => setStart((s) => shiftPeriod(kind, s, -1))} title="Previous">
            <ChevronLeft size={17} strokeWidth={2} />
          </button>
          <AnimatePresence mode="wait">
            <motion.div className="period-title" key={allTime ? 'all' : `${kind}-${start}`}
              initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.14 }}>
              <div className="day-label">{allTime ? 'All time' : periodLabel(kind, start)}</div>
              {!allTime && !atNow && (
                <button className="today-jump" onClick={() => setStart(periodStart(kind))}>Jump to current</button>
              )}
            </motion.div>
          </AnimatePresence>
          <button className="day-arrow" disabled={allTime || atNow} onClick={() => setStart((s) => shiftPeriod(kind, s, 1))} title="Next">
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
          {!allTime && (
            <div className="stat">
              <span className="stat-k">Avg / day{(kind === 'day' || kind === 'week') ? ' (7d)' : ''}</span>
              <b className="stat-v">{rupees(avgPerDay)}</b>
            </div>
          )}
        </div>

        {!allTime && kind !== 'day' && buckets.some((b) => b.value > 0) && (
          <div className="period-trend"><TrendBars buckets={buckets} height={52} /></div>
        )}

        {biggest && (
          <p className="period-note">
            Largest: <b>{biggest.note || biggest.category}</b> · {rupees(biggest.amount)}
          </p>
        )}
      </div>

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
                    {Object.keys(CATEGORIES).map((c) => <option key={c}>{c}</option>)}
                  </select>
                </label>
                <label><span>Account</span>
                  <select value={account} onChange={(e) => setAccount(e.target.value)}>
                    <option value="">Any</option>
                    {store.accounts.map((a) => <option key={a}>{a}</option>)}
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
              </div>
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
        <AnimatePresence mode="wait">
          <motion.ul className="tx-list" key={`${kind}-${start}-${allTime}-${sort}`}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
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
        </AnimatePresence>
      </div>
    </section>
  );
}
