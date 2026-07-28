'use client';
// Ledger: day-pager view (‹ day ›) by default; searching or filtering switches
// to results grouped under date headers.
import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useStore } from '@/lib/client/store';
import { CATEGORIES, rupees } from '@/lib/client/constants';
import TxItem from '../TxItem';

const DAY_MS = 86400000;
const startOfDay = (t = Date.now()) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

function dayLabel(dayStart) {
  const today = startOfDay();
  if (dayStart === today) return 'Today';
  if (dayStart === today - DAY_MS) return 'Yesterday';
  if (dayStart === today + DAY_MS) return 'Tomorrow';
  return new Date(dayStart).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export default function Ledger() {
  const store = useStore();
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [cat, setCat] = useState('');
  const [proj, setProj] = useState('');
  const [day, setDay] = useState(() => startOfDay());

  const projects = store.projects();
  const filtersActive = Boolean(q || type || cat || proj);

  // shared filter pass (without date)
  const filtered = useMemo(() => {
    let l = store.live();
    if (type) l = l.filter((t) => t.type === type);
    if (cat) l = l.filter((t) => t.category === cat);
    if (proj) l = l.filter((t) => t.project === proj);
    if (q) {
      const s = q.toLowerCase();
      l = l.filter((t) => `${t.note} ${t.category} ${t.project} ${t.account}`.toLowerCase().includes(s));
    }
    return l.sort((a, b) => b.occurred_at - a.occurred_at);
  }, [store, store.txs, q, type, cat, proj]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── day mode ──
  const dayList = filtered.filter((t) => t.occurred_at >= day && t.occurred_at < day + DAY_MS);
  const dayTotals = store.totals(dayList);
  const earliest = filtered.length ? startOfDay(Math.min(...filtered.map((t) => Number(t.occurred_at)))) : startOfDay();
  const latest = Math.max(startOfDay(), filtered.length ? startOfDay(Math.max(...filtered.map((t) => Number(t.occurred_at)))) : 0);

  // ── results mode: group by date ──
  const groups = useMemo(() => {
    if (!filtersActive) return [];
    const map = new Map();
    for (const t of filtered.slice(0, 400)) {
      const k = startOfDay(Number(t.occurred_at));
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(t);
    }
    return [...map.entries()];
  }, [filtered, filtersActive]);

  const overall = store.totals(filtered);

  return (
    <section className="view">
      <header className="view-head">
        <div>
          <h2>Ledger</h2>
          <p className="sub">
            {filtersActive
              ? `${filtered.length} matches · in ${rupees(overall.inc)} · out ${rupees(overall.exp)}`
              : 'Browse day by day, or search everything'}
          </p>
        </div>
      </header>

      <div className="filters card">
        <input type="search" className="search" placeholder="Search notes, categories, projects…"
          value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="filter-row">
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All types</option><option value="expense">Expense</option>
            <option value="income">Income</option><option value="transfer">Transfer</option>
          </select>
          <select value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">All categories</option>
            {Object.keys(CATEGORIES).map((c) => <option key={c}>{c}</option>)}
          </select>
          <select value={proj} onChange={(e) => setProj(e.target.value)}>
            <option value="">All projects</option>
            {projects.map((p) => <option key={p}>{p}</option>)}
          </select>
        </div>
      </div>

      {filtersActive ? (
        /* ── grouped results ── */
        <ul className="tx-list card">
          {groups.length ? groups.map(([k, items]) => {
            const g = store.totals(items);
            return (
              <li key={k}>
                <div className="date-head">
                  <span>{dayLabel(k)}</span>
                  <span>
                    {g.inc > 0 && <b style={{ color: 'var(--accent)' }}>+{rupees(g.inc)} </b>}
                    {g.exp > 0 && <b style={{ color: 'var(--red)' }}>−{rupees(g.exp)}</b>}
                  </span>
                </div>
                <ul className="tx-list">{items.map((t, i) => <TxItem key={t.id} t={t} index={i} />)}</ul>
              </li>
            );
          }) : <li className="empty">Nothing matches. Try clearing filters.</li>}
        </ul>
      ) : (
        /* ── day pager ── */
        <>
          <div className="day-nav">
            <button className="day-arrow" title="Previous day"
              disabled={day <= earliest}
              onClick={() => setDay((d) => d - DAY_MS)}>
              <ChevronLeft size={17} strokeWidth={2} />
            </button>
            <AnimatePresence mode="wait">
              <motion.div className="day-center" key={day}
                initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.14, ease: 'easeOut' }}>
                <div className="day-label">{dayLabel(day)}</div>
                <div className="day-sub">
                  <span>{dayList.length ? `${dayList.length} ${dayList.length === 1 ? 'entry' : 'entries'}` : 'No entries'}</span>
                  {dayTotals.inc > 0 && <b className="in">+{rupees(dayTotals.inc)}</b>}
                  {dayTotals.exp > 0 && <b className="out">−{rupees(dayTotals.exp)}</b>}
                </div>
                {day !== startOfDay() && (
                  <button className="today-jump" onClick={() => setDay(startOfDay())}>Back to today</button>
                )}
              </motion.div>
            </AnimatePresence>
            <button className="day-arrow" title="Next day"
              disabled={day >= latest}
              onClick={() => setDay((d) => d + DAY_MS)}>
              <ChevronRight size={17} strokeWidth={2} />
            </button>
          </div>

          <AnimatePresence mode="wait">
            <motion.ul className="tx-list card" key={`list-${day}`}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}>
              {dayList.length
                ? dayList.map((t, i) => <TxItem key={t.id} t={t} index={i} />)
                : <li className="empty">Nothing on {dayLabel(day).toLowerCase()}.</li>}
            </motion.ul>
          </AnimatePresence>
        </>
      )}
    </section>
  );
}
