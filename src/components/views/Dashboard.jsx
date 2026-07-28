'use client';
// Dashboard — KPI strip, spend trend, category ranking, budget rings,
// project split, top merchants, and auto-computed insight cards.
import { useEffect, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp, TrendingDown, Wallet, CalendarDays,
  Flame, PiggyBank, Target, ArrowRight, Check,
} from 'lucide-react';
import ThemeToggle from '../ThemeToggle';
import { useStore } from '@/lib/client/store';
import { rupees, monthKey, CATEGORIES } from '@/lib/client/constants';
import { DAY_MS, startOfDay, startOfWeek, startOfMonth } from '@/lib/client/period';
import { useUI } from '../App';
import Donut from '../charts/Donut';
import TrendBars from '../charts/TrendBars';
import CategoryBars from '../charts/CategoryBars';
import TxItem from '../TxItem';
import CategoryIcon from '../CategoryIcon';

function AnimatedAmount({ paise, className = 'hero-amount' }) {
  const ref = useRef(null);
  const prev = useRef(0);
  useEffect(() => {
    const from = prev.current, to = paise, t0 = performance.now();
    prev.current = to;
    let raf;
    const step = (t) => {
      const p = Math.min(1, (t - t0) / 600), e = 1 - Math.pow(1 - p, 3);
      if (ref.current) ref.current.textContent = rupees(Math.round(from + (to - from) * e));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [paise]);
  return <h1 className={className} ref={ref}>₹0</h1>;
}

export default function Dashboard() {
  const store = useStore();
  const { setView, openBudget } = useUI();
  const all = store.live();
  const { inc, exp } = store.totals(all);

  const now = Date.now();
  const mStart = startOfMonth(now);
  const monthList = all.filter((t) => t.occurred_at >= mStart);
  const mt = store.totals(monthList);

  // ── comparisons ──
  const stats = useMemo(() => {
    const todayS = startOfDay(now), weekS = startOfWeek(now);
    const lastWeekS = weekS - 7 * DAY_MS;
    const lastMonthS = new Date(new Date(mStart).getFullYear(), new Date(mStart).getMonth() - 1, 1).getTime();
    const sum = (list) => list.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

    const today = sum(all.filter((t) => t.occurred_at >= todayS));
    const week = sum(all.filter((t) => t.occurred_at >= weekS));
    const lastWeek = sum(all.filter((t) => t.occurred_at >= lastWeekS && t.occurred_at < weekS));
    const lastMonth = sum(all.filter((t) => t.occurred_at >= lastMonthS && t.occurred_at < mStart));
    const daysIn = Math.max(1, Math.ceil((now - mStart) / DAY_MS));
    const dailyAvg = Math.round(mt.exp / daysIn);
    const daysInMonth = new Date(new Date(mStart).getFullYear(), new Date(mStart).getMonth() + 1, 0).getDate();
    const projected = dailyAvg * daysInMonth;

    // spend-free streak
    let streak = 0;
    for (let d = todayS - DAY_MS; d > todayS - 60 * DAY_MS; d -= DAY_MS) {
      const spent = all.some((t) => t.type === 'expense' && t.occurred_at >= d && t.occurred_at < d + DAY_MS);
      if (spent) break;
      streak++;
    }
    return { today, week, lastWeek, lastMonth, dailyAvg, projected, daysInMonth, streak };
  }, [all, mt.exp, mStart, now]);

  const wowDelta = stats.lastWeek ? ((stats.week - stats.lastWeek) / stats.lastWeek) * 100 : null;
  const momDelta = stats.lastMonth ? ((mt.exp - stats.lastMonth) / stats.lastMonth) * 100 : null;

  // ── 7-day trend ──
  const trend = useMemo(() => {
    const out = [];
    for (let i = 6; i >= 0; i--) {
      const s = startOfDay(now) - i * DAY_MS;
      out.push({
        start: s, label: i === 0 ? 'Today' : new Date(s).toLocaleDateString('en-IN', { weekday: 'short' }),
        value: all.filter((t) => t.type === 'expense' && t.occurred_at >= s && t.occurred_at < s + DAY_MS)
          .reduce((sum, t) => sum + t.amount, 0),
      });
    }
    return out;
  }, [all, now]);

  const catSpend = store.catSpend();
  const overall = store.effectiveBudget('', monthKey());
  const pct = overall ? Math.min(100, (mt.exp / overall) * 100) : 0;
  const monthBudgets = store.budgets.filter((b) => b.month === monthKey() && b.category);

  // ── project split ──
  const projectSpend = useMemo(() => {
    const map = {};
    for (const t of monthList) if (t.type === 'expense' && t.project) map[t.project] = (map[t.project] || 0) + t.amount;
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 4);
  }, [monthList]);

  // ── recurring / top notes ──
  const topNotes = useMemo(() => {
    const map = {};
    for (const t of monthList) {
      if (t.type !== 'expense' || !t.note) continue;
      const k = t.note.trim().toLowerCase();
      if (!map[k]) map[k] = { label: t.note.trim(), total: 0, count: 0, category: t.category };
      map[k].total += t.amount; map[k].count++;
    }
    return Object.values(map).sort((a, b) => b.total - a.total).slice(0, 4);
  }, [monthList]);

  const recent = [...all].sort((a, b) => b.occurred_at - a.occurred_at).slice(0, 5);
  const h = new Date().getHours();

  return (
    <section className="view">
      <header className="view-head has-toggle">
        <div>
          <h2>{h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'}{store.name ? `, ${store.name}` : ''}</h2>
          <p className="sub">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
        <ThemeToggle />
      </header>

      {/* ── hero + KPI strip ── */}
      <div className="hero-card">
        <p className="hero-label">Net balance</p>
        <AnimatedAmount paise={inc - exp} />
        <div className="kpi-strip">
          <Kpi icon={<CalendarDays size={14} />} label="Today" value={rupees(stats.today)} />
          <Kpi icon={<Wallet size={14} />} label="This week" value={rupees(stats.week)}
            delta={wowDelta} deltaLabel="vs last week" />
          <Kpi icon={<TrendingDown size={14} />} label="This month" value={rupees(mt.exp)}
            delta={momDelta} deltaLabel="vs last month" />
          <Kpi icon={<PiggyBank size={14} />} label="Avg / day" value={rupees(stats.dailyAvg)} />
        </div>
        {overall > 0 && (
          <>
            <div className="budget-track">
              <div className={`budget-fill ${mt.exp > overall ? 'over' : ''}`} style={{ width: `${pct}%` }} />
            </div>
            <div className={`pace-tag ${mt.exp > overall ? 'warn' : 'good'}`}>
              {mt.exp > overall
                ? <><TrendingUp size={12} strokeWidth={2.6} /> Over budget by {rupees(mt.exp - overall)}</>
                : <><Check size={12} strokeWidth={2.6} /> {rupees(overall - mt.exp)} left of {rupees(overall)} · projected {rupees(stats.projected)}</>}
            </div>
          </>
        )}
        {!overall && (
          <p className="budget-line">
            No monthly budget yet, <a href="#" className="link" onClick={(e) => { e.preventDefault(); setView('budgets'); }}>set one</a> to track pace.
          </p>
        )}
      </div>

      {/* ── insight cards ── */}
      <div className="insight-strip">
        {momDelta !== null && (
          <InsightCard
            icon={momDelta > 0 ? <TrendingUp size={15} /> : <TrendingDown size={15} />}
            tone={momDelta > 0 ? 'warn' : 'good'}
            title={`${Math.abs(Math.round(momDelta))}% ${momDelta > 0 ? 'higher' : 'lower'} than last month`}
            body={`${rupees(mt.exp)} so far vs ${rupees(stats.lastMonth)} by this point last month.`}
          />
        )}
        {overall > 0 && stats.projected > overall && (
          <InsightCard icon={<Target size={15} />} tone="warn"
            title="On pace to exceed budget"
            body={`At ${rupees(stats.dailyAvg)}/day you'll reach ${rupees(stats.projected)}: ${rupees(stats.projected - overall)} over.`} />
        )}
        {stats.streak >= 2 && (
          <InsightCard icon={<Flame size={15} />} tone="good"
            title={`${stats.streak} no-spend days`}
            body="You haven't logged an expense in that stretch. Nice discipline." />
        )}
        {Object.keys(catSpend).length > 0 && (() => {
          const [topCat, topVal] = Object.entries(catSpend).sort((a, b) => b[1] - a[1])[0];
          const share = Math.round((topVal / mt.exp) * 100);
          return (
            <InsightCard icon={<CategoryIcon category={topCat} size={13} />} tone="neutral"
              title={`${topCat} leads at ${share}%`}
              body={`${rupees(topVal)} this month, your largest category.`} />
          );
        })()}
      </div>

      {/* ── trend ── */}
      <div className="card">
        <div className="card-head">
          <h3>Daily spending · last 7 days</h3>
          <span className="muted small">Peak {rupees(Math.max(...trend.map((t) => t.value), 0))}</span>
        </div>
        <TrendBars buckets={trend} height={120} showValues />
      </div>

      {/* ── category breakdown ── */}
      <div className="grid-2">
        <div className="card">
          <h3>Where it went · this month</h3>
          <CategoryBars spend={catSpend} limit={6} />
        </div>
        <div className="card">
          <h3>Share of spending</h3>
          <Donut spend={catSpend} />
        </div>
      </div>

      {/* ── budgets + projects ── */}
      <div className="grid-2">
        {monthBudgets.length > 0 && (
          <div className="card">
            <div className="card-head"><h3>Budget progress</h3>
              <a href="#" className="link" onClick={(e) => { e.preventDefault(); setView('budgets'); }}>Manage</a>
            </div>
            <div className="mini-budgets">
              {monthBudgets.slice(0, 5).map((b) => {
                const eff = store.effectiveBudget(b.category, monthKey());
                const spent = catSpend[b.category] || 0;
                const p = eff ? Math.min(100, (spent / eff) * 100) : 0;
                return (
                  <div className="mini-budget" key={b.category} onClick={() => openBudget(b.category)}>
                    <div className="mini-budget-top">
                      <span><CategoryIcon category={b.category} size={12} /> {b.category}</span>
                      <span className="muted small">{rupees(spent)} / {rupees(eff)}</span>
                    </div>
                    <div className="budget-track">
                      <motion.div className={`budget-fill ${spent > eff ? 'over' : ''}`}
                        initial={{ width: 0 }} animate={{ width: `${p}%` }}
                        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {projectSpend.length > 0 && (
          <div className="card">
            <h3>By project · this month</h3>
            <div className="mini-budgets">
              {projectSpend.map(([name, val]) => {
                const top = projectSpend[0][1];
                return (
                  <div className="mini-budget" key={name}>
                    <div className="mini-budget-top">
                      <span className="tx-tag">{name}</span>
                      <span className="muted small">{rupees(val)}</span>
                    </div>
                    <div className="budget-track">
                      <motion.div className="budget-fill" initial={{ width: 0 }}
                        animate={{ width: `${(val / top) * 100}%` }}
                        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── frequent spends ── */}
      {topNotes.length > 0 && (
        <div className="card">
          <h3>Biggest recurring spends · this month</h3>
          <div className="chip-rows">
            {topNotes.map((n) => (
              <div className="chip-row" key={n.label}>
                <CategoryIcon category={n.category} size={13} />
                <span className="chip-row-label">{n.label}</span>
                {n.count > 1 && <span className="tx-tag">×{n.count}</span>}
                <b>{rupees(n.total)}</b>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── recent ── */}
      <div className="card">
        <div className="card-head">
          <h3>Recent activity</h3>
          <a href="#" className="link" onClick={(e) => { e.preventDefault(); setView('transactions'); }}>
            View ledger <ArrowRight size={13} style={{ verticalAlign: '-2px' }} />
          </a>
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

function Kpi({ icon, label, value, delta, deltaLabel }) {
  return (
    <div className="kpi">
      <span className="kpi-label">{icon}{label}</span>
      <b className="kpi-value">{value}</b>
      {delta !== null && delta !== undefined && Number.isFinite(delta) && (
        <span className={`kpi-delta ${delta > 0 ? 'up' : 'down'}`} title={deltaLabel}>
          {delta > 0 ? '▲' : '▼'} {Math.abs(Math.round(delta))}%
        </span>
      )}
    </div>
  );
}

function InsightCard({ icon, title, body, tone = 'neutral' }) {
  return (
    <motion.div className={`insight-tile ${tone}`}
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
      <span className="insight-ico">{icon}</span>
      <div>
        <div className="insight-title">{title}</div>
        <div className="insight-body">{body}</div>
      </div>
    </motion.div>
  );
}

