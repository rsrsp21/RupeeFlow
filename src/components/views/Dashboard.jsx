'use client';
import { useEffect, useRef } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useStore } from '@/lib/client/store';
import { rupees, monthKey } from '@/lib/client/constants';
import { useUI } from '../App';
import Donut from '../charts/Donut';
import Bars from '../charts/Bars';
import TxItem from '../TxItem';

function AnimatedAmount({ paise }) {
  const ref = useRef(null);
  const prev = useRef(0);
  useEffect(() => {
    const from = prev.current, to = paise, t0 = performance.now();
    prev.current = to;
    let raf;
    const step = (t) => {
      const p = Math.min(1, (t - t0) / 500), e = 1 - Math.pow(1 - p, 3);
      if (ref.current) ref.current.textContent = rupees(Math.round(from + (to - from) * e));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [paise]);
  return <h1 className="hero-amount" ref={ref}>₹0</h1>;
}

export default function Dashboard() {
  const store = useStore();
  const { setView } = useUI();
  const all = store.live();
  const { inc, exp } = store.totals(all);
  const monthList = all.filter((t) => store.inMonth(t));
  const mt = store.totals(monthList);
  const overall = store.effectiveBudget('', monthKey());
  const pct = overall ? Math.min(100, (mt.exp / overall) * 100) : 0;
  const recent = [...all].sort((a, b) => b.occurred_at - a.occurred_at).slice(0, 6);
  const h = new Date().getHours();

  return (
    <section className="view">
      <header className="view-head">
        <div>
          <h2>{h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'}</h2>
          <p className="sub">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
        <ThemeToggle />
      </header>

      <div className="hero-card">
        <p className="hero-label">Net balance</p>
        <AnimatedAmount paise={inc - exp} />
        <div className="hero-row">
          <div className="pill income"><span>In · this month</span><b>{rupees(mt.inc)}</b></div>
          <div className="pill expense"><span>Out · this month</span><b>{rupees(mt.exp)}</b></div>
        </div>
        <div className="budget-track">
          <div className={`budget-fill ${overall && mt.exp > overall ? 'over' : ''}`} style={{ width: `${pct}%` }} />
        </div>
        <p className="budget-line">
          {!overall ? 'No monthly budget set — add one under Budgets'
            : mt.exp > overall ? `Over budget by ${rupees(mt.exp - overall)}`
            : `${rupees(overall - mt.exp)} left of ${rupees(overall)} this month`}
        </p>
      </div>

      <div className="grid-2">
        <div className="card">
          <h3>Spending by category</h3>
          <Donut spend={store.catSpend()} />
        </div>
        <div className="card">
          <h3>Last 14 days</h3>
          <Bars transactions={all} />
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Recent activity</h3>
          <a href="#" className="link" onClick={(e) => { e.preventDefault(); setView('transactions'); }}>View all</a>
        </div>
        <ul className="tx-list">
          {recent.length
            ? recent.map((t, i) => <TxItem key={t.id} t={t} index={i} />)
            : <li className="empty">No entries yet. Use the + button to add your first.</li>}
        </ul>
      </div>
    </section>
  );
}

function ThemeToggle() {
  const isDark = typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark';
  const toggle = () => {
    const el = document.documentElement;
    el.dataset.theme = el.dataset.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('rf_theme', el.dataset.theme);
  };
  return (
    <button className="icon-btn" onClick={toggle} title="Toggle theme">
      {isDark ? <Sun size={17} strokeWidth={1.9} /> : <Moon size={17} strokeWidth={1.9} />}
    </button>
  );
}
