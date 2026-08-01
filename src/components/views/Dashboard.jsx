'use client';
// Dashboard — KPI strip, spend trend, category ranking, budget rings,
// top merchants, and auto-computed insight cards.
import { useEffect, useRef, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp, TrendingDown, Wallet, CalendarDays,
  Flame, PiggyBank, Target, ArrowRight, Check,
  Sunrise, Sun, Sunset, Moon, Sparkles,
} from 'lucide-react';
import ThemeToggle from '../ThemeToggle';
import SyncBadge from '../SyncBadge';
import SettingsLink from '../SettingsLink';
import BudgetsLink from '../BudgetsLink';
import { useStore } from '@/lib/client/store';
import { rupees, monthKey, CATEGORIES } from '@/lib/client/constants';
import { DAY_MS, startOfDay, startOfWeek, startOfMonth } from '@/lib/client/period';
import { useUI } from '../App';
import Donut from '../charts/Donut';
import TrendBars from '../charts/TrendBars';
import CategoryBars from '../charts/CategoryBars';
import TxItem from '../TxItem';
import CategoryIcon from '../CategoryIcon';
import AccountsSummary from '../AccountsSummary';
import InsightCarousel from '../InsightCarousel';

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

// One account, another, or everything combined — whichever was picked last
// stays picked; localStorage survives reloads and even a different device
// pulling the same login, unlike component state.
const ACCT_FILTER_KEY = 'rf_dashboard_account';

export default function Dashboard() {
  const store = useStore();
  const { setView, openBudget } = useUI();

  const [acctFilter, setAcctFilter] = useState('all');
  useEffect(() => {
    const saved = localStorage.getItem(ACCT_FILTER_KEY);
    if (saved) setAcctFilter(saved);
  }, []);
  // If the saved filter points at an account that's since been removed,
  // fall back to "All" rather than silently showing an empty dashboard.
  useEffect(() => {
    if (acctFilter !== 'all' && store.accounts.length && !store.accounts.some((a) => a.name === acctFilter)) {
      setAcctFilter('all');
      localStorage.setItem(ACCT_FILTER_KEY, 'all');
    }
  }, [acctFilter, store.accounts]);
  function changeFilter(v) {
    setAcctFilter(v);
    localStorage.setItem(ACCT_FILTER_KEY, v);
  }

  const all = useMemo(() => {
    const live = store.live();
    if (acctFilter === 'all') return live;
    return live.filter((t) => t.account === acctFilter || t.to_account === acctFilter);
  }, [store, store.txs, acctFilter]); // eslint-disable-line react-hooks/exhaustive-deps
  const { inc, exp } = store.totals(all);
  // "Net balance" is meant to read as real money on hand, so it has to start
  // from whatever balance each account already had before RupeeFlow existed
  // (accountBalances() seeds from opening_balance) — inc - exp alone ignores
  // that entirely. Reusing accountBalances() directly also makes the
  // single-account view exact (transfers in/out of just that account),
  // rather than re-deriving it from a filtered transaction list.
  const balances = store.accountBalances();
  const netBalance = acctFilter === 'all'
    ? Object.values(balances).reduce((s, b) => s + b, 0)
    : (balances[acctFilter] || 0);

  const now = Date.now();
  const mStart = startOfMonth(now);
  const monthList = all.filter((t) => t.occurred_at >= mStart);
  const mt = store.totals(monthList);

  // Early in a month (day 1-2 especially) "this month" is nearly empty, so
  // last month's numbers matter more for actually understanding spending —
  // surfaced as its own comparison/breakdown further down, not just folded
  // into the momDelta percentage.
  const lastMonthStart = new Date(new Date(mStart).getFullYear(), new Date(mStart).getMonth() - 1, 1).getTime();
  const lastMonthList = all.filter((t) => t.occurred_at >= lastMonthStart && t.occurred_at < mStart);
  const lmt = store.totals(lastMonthList);
  const lastMonthCatSpend = useMemo(() => {
    const map = {};
    for (const t of lastMonthList) if (t.type === 'expense') map[t.category] = (map[t.category] || 0) + t.amount;
    return map;
  }, [lastMonthList]);

  // 6-month expense trend — a longer view than the 7-day chart below, so a
  // fresh month always has *something* substantial to show even on day one.
  const monthlyTrend = useMemo(() => {
    const out = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(new Date(mStart).getFullYear(), new Date(mStart).getMonth() - i, 1);
      const s = d.getTime();
      const e = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
      out.push({
        start: s, label: d.toLocaleDateString('en-IN', { month: 'short' }),
        value: all.filter((t) => t.type === 'expense' && t.occurred_at >= s && t.occurred_at < e)
          .reduce((sum, t) => sum + t.amount, 0),
      });
    }
    return out;
  }, [all, mStart]);

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

    // spend-free streak — only meaningful once there's at least one real
    // expense on record; otherwise a brand-new account with zero history
    // would count every day back to the loop's own limit as a "streak"
    // (59 no-spend days on day one), which isn't a streak at all.
    let streak = 0;
    const hasAnyExpense = all.some((t) => t.type === 'expense');
    if (hasAnyExpense) {
      for (let d = todayS - DAY_MS; d > todayS - 60 * DAY_MS; d -= DAY_MS) {
        const spent = all.some((t) => t.type === 'expense' && t.occurred_at >= d && t.occurred_at < d + DAY_MS);
        if (spent) break;
        streak++;
      }
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

  // Scoped to the same account filter as everything else, rather than
  // store.catSpend()'s always-all-accounts view.
  const catSpend = useMemo(() => {
    const map = {};
    for (const t of monthList) if (t.type === 'expense') map[t.category] = (map[t.category] || 0) + t.amount;
    return map;
  }, [monthList]);
  // "No monthly budget yet" only ever checked for an *overall* cap, so
  // someone who'd carefully set per-category budgets was still told they had
  // none. Fall back to the sum of their category budgets as the monthly cap.
  const explicitOverall = store.effectiveBudget('', monthKey());
  const monthBudgets = store.budgets.filter((b) => b.month === monthKey() && b.category);
  const derivedOverall = monthBudgets.reduce((s2, b) => s2 + (store.effectiveBudget(b.category, monthKey()) || 0), 0);
  const overall = explicitOverall || derivedOverall;
  const overallIsDerived = !explicitOverall && derivedOverall > 0;
  const pct = overall ? Math.min(100, (mt.exp / overall) * 100) : 0;

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
  // Four buckets, not three — "Good evening" at 5pm was showing a moon, which
  // reads as the middle of the night. Sunset covers the actual evening and the
  // moon is held back for genuinely late hours.
  const greet = h < 12 ? { icon: <Sunrise size={19} strokeWidth={2} />, text: 'Good morning' }
    : h < 17 ? { icon: <Sun size={19} strokeWidth={2} />, text: 'Good afternoon' }
    : h < 21 ? { icon: <Sunset size={19} strokeWidth={2} />, text: 'Good evening' }
    : { icon: <Moon size={19} strokeWidth={2} />, text: 'Good night' };
  // A long full name would push the greeting onto several lines on mobile.
  // Two words is enough to feel personal, but two *long* words still overflow
  // (and one long unbroken word has nowhere to wrap), so cap the characters too.
  const shortName = (() => {
    const words = (store.name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2);
    const joined = words.join(' ');
    return joined.length > 20 ? `${joined.slice(0, 19).trimEnd()}…` : joined;
  })();

  return (
    <section className="view">
      {/* Sticky header is a brand mark on mobile (there's no sidebar there to
          show it) rather than the greeting — the greeting is time/name-
          dependent and reads oddly pinned in place while you scroll past it.
          Hidden on desktop entirely: the sidebar already shows the brand, and
          the theme toggle lives in Settings there instead of duplicating it. */}
      <header className="view-head has-toggle dashboard-head">
        <div className="dashboard-brand">
          <svg viewBox="0 0 48 48" width="22" height="22"><use href="/icon.svg#mark" /></svg>
          <span>RupeeFlow</span>
        </div>
        <ThemeToggle />
        <div className="view-head-utils"><SyncBadge /><BudgetsLink /><SettingsLink /></div>
      </header>

      {/* Greeting + date moved down into the scrollable body (leads with a
          time-of-day icon — sunrise / sun / moon — matching the wording). */}
      <div className="dashboard-greeting">
        <h2>
          {greet.icon}
          {greet.text}{shortName ? `, ${shortName}` : ''}
        </h2>
        <p className="sub">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      </div>

      {/* ── hero + KPI strip ── */}
      <div className="hero-card">
        <div className="hero-top-row">
          <p className="hero-label">Net balance</p>
          {store.accounts.length > 1 && (
            <select className="hero-acct-select" value={acctFilter} onChange={(e) => changeFilter(e.target.value)}>
              <option value="all">All accounts</option>
              {store.accounts.map((a) => <option key={a.name} value={a.name}>{a.name}</option>)}
            </select>
          )}
        </div>
        <AnimatedAmount paise={netBalance} />
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
            {overallIsDerived && (
              <p className="budget-line">Cap added up from your category budgets — set an overall one for a single monthly limit.</p>
            )}
          </>
        )}
        {!overall && (
          <p className="budget-line">
            No budget yet, <a href="#" className="link" onClick={(e) => { e.preventDefault(); setView('budgets'); }}>set one</a> to track pace.
          </p>
        )}
      </div>

      <AccountsSummary onManage={() => setView('money')} />

      {/* ── insight cards ── */}
      <InsightCarousel>
        {mt.saved > 0 && (
          <InsightCard icon={<PiggyBank size={15} />} tone="good"
            title={`${rupees(mt.saved)} saved & invested this month`}
            body="Kept out of your spending total — that money's still yours, just moved." />
        )}
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
      </InsightCarousel>

      {/* ── ask AI ── */}
      <button className="ai-cta" onClick={() => setView('insights')}>
        <span className="ai-cta-glow" aria-hidden="true" />
        <Sparkles size={16} strokeWidth={2} />
        <span className="ai-cta-text">
          <b>Ask AI about your money</b>
          <em>Coaching, a health score, and answers from your own ledger</em>
        </span>
        <ArrowRight size={15} />
      </button>

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
          {Object.keys(catSpend).length
            ? <CategoryBars spend={catSpend} limit={6} />
            : <p className="muted small">Nothing logged this month yet.</p>}
        </div>
        <div className="card">
          <h3>Share of spending</h3>
          {Object.keys(catSpend).length
            ? <Donut spend={catSpend} />
            : <p className="muted small">Nothing logged this month yet.</p>}
        </div>
      </div>

      {/* ── monthly trend ── */}
      <div className="card">
        <div className="card-head">
          <h3>Monthly spending · last 6 months</h3>
          <span className="muted small">Peak {rupees(Math.max(...monthlyTrend.map((t) => t.value), 0))}</span>
        </div>
        <TrendBars buckets={monthlyTrend} height={120} showValues />
      </div>

      {/* ── last month ── */}
      {lmt.exp > 0 && (
        <>
          <div className="card">
            <div className="card-head"><h3>This month vs last month</h3></div>
            <div className="stat-row">
              <div className="stat">
                <span className="stat-k">Spent this month</span>
                <b className="stat-v out">{rupees(mt.exp)}</b>
              </div>
              <div className="stat">
                <span className="stat-k">Spent last month</span>
                <b className="stat-v">{rupees(lmt.exp)}</b>
              </div>
              <div className="stat">
                <span className="stat-k">Received this month</span>
                <b className="stat-v in">{rupees(mt.inc)}</b>
              </div>
              <div className="stat">
                <span className="stat-k">Received last month</span>
                <b className="stat-v">{rupees(lmt.inc)}</b>
              </div>
            </div>
          </div>

          <div className="grid-2">
            <div className="card">
              <h3>Where it went · last month</h3>
              <CategoryBars spend={lastMonthCatSpend} limit={6} />
            </div>
            <div className="card">
              <h3>Share of spending · last month</h3>
              <Donut spend={lastMonthCatSpend} />
            </div>
          </div>
        </>
      )}

      {/* ── budget progress ── */}
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

