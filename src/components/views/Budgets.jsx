'use client';
// Budgets — overall ring with pace tracking, per-category progress rows,
// and one-tap AI budget suggestions from real spending history.
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, Sparkles, Check, RefreshCw, Target, TrendingUp, X } from 'lucide-react';
import { useStore } from '@/lib/client/store';
import { rupees, monthKey, CATEGORIES } from '@/lib/client/constants';
import { DAY_MS, startOfMonth } from '@/lib/client/period';
import { useUI } from '../App';
import CategoryIcon from '../CategoryIcon';

export default function Budgets() {
  const store = useStore();
  const { openBudget } = useUI();
  const mk = monthKey();
  const spend = store.catSpend(mk);
  const monthList = store.live().filter((t) => store.inMonth(t));
  const monthTotal = store.totals(monthList).exp;
  const budgets = store.budgets.filter((b) => b.month === mk);
  const overall = store.effectiveBudget('', mk);
  const catBudgets = budgets.filter((b) => b.category);

  const [suggestions, setSuggestions] = useState(null);
  const [loadingSuggest, setLoadingSuggest] = useState(false);
  const [applied, setApplied] = useState([]);

  // pace: where you *should* be by today if spending evenly
  const now = Date.now();
  const mStart = startOfMonth(now);
  const daysIn = new Date(new Date(mStart).getFullYear(), new Date(mStart).getMonth() + 1, 0).getDate();
  const dayOfMonth = Math.max(1, Math.ceil((now - mStart) / DAY_MS));
  const expectedPct = (dayOfMonth / daysIn) * 100;
  const usedPct = overall ? Math.min(100, (monthTotal / overall) * 100) : 0;
  const projected = overall ? Math.round((monthTotal / dayOfMonth) * daysIn) : 0;
  const onTrack = overall ? projected <= overall : null;

  // uncovered categories worth budgeting
  const uncovered = Object.entries(spend)
    .filter(([c]) => !catBudgets.some((b) => b.category === c))
    .sort((a, b) => b[1] - a[1]).slice(0, 4);

  async function suggest() {
    setLoadingSuggest(true);
    try {
      const out = await store.api('/ai/budget-suggest', {
        method: 'POST', body: JSON.stringify({ summary: store.buildSummary(120) }),
      });
      const clean = sanitizeSuggestions(out);
      if (!clean) throw new Error('response had no usable budget suggestions');
      setSuggestions(clean);
    } catch (e) { store.toast('Could not generate: ' + e.message); }
    setLoadingSuggest(false);
  }

  async function applyOne(category, rupeesVal) {
    await store.saveBudget({ month: mk, category, amount: Math.round(rupeesVal * 100), carry_forward: 0 });
    setApplied((a) => [...a, category]);
    store.toast(`Budget set for ${category || 'overall'}`);
  }

  async function applyAll() {
    if (!suggestions) return;
    const applied_ = [];
    if (suggestions.overall_rupees > 0) {
      await store.saveBudget({ month: mk, category: '', amount: Math.round(suggestions.overall_rupees * 100), carry_forward: 0 });
      applied_.push('');
    }
    for (const c of suggestions.categories || []) {
      await store.saveBudget({ month: mk, category: c.category, amount: Math.round(c.suggested_rupees * 100), carry_forward: 0 });
      applied_.push(c.category);
    }
    setApplied(applied_);
    store.toast('All suggested budgets applied');
  }

  return (
    <section className="view">
      <header className="view-head">
        <div>
          <h2>Budgets</h2>
          <p className="sub">{new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })} · day {dayOfMonth} of {daysIn}</p>
        </div>
        <div className="head-actions">
          <button className="btn ghost" onClick={suggest} disabled={loadingSuggest}>
            <Sparkles size={14} className={loadingSuggest ? 'spin' : ''} /> AI suggest
          </button>
          <button className="btn ghost" onClick={() => openBudget('')}><Plus size={14} /> New</button>
        </div>
      </header>

      {/* ── overall ── */}
      <div className="card budget-hero">
        {overall > 0 ? (
          <>
            <div className="budget-hero-main">
              <BudgetRing used={usedPct} expected={expectedPct} over={monthTotal > overall} />
              <div className="budget-hero-text">
                <span className="hero-label">Overall monthly</span>
                <h1 className="budget-hero-amt">{rupees(monthTotal)}</h1>
                <p className="muted small">of {rupees(overall)} budgeted</p>
                <div className={`pace-tag ${onTrack ? 'good' : 'warn'}`}>
                  {onTrack
                    ? <><Check size={12} strokeWidth={2.6} /> On track · projected {rupees(projected)}</>
                    : <><TrendingUp size={12} strokeWidth={2.6} /> Projected {rupees(projected)} · {rupees(projected - overall)} over</>}
                </div>
              </div>
            </div>
            <div className="budget-hero-stats">
              <div><span>Remaining</span><b style={{ color: monthTotal > overall ? 'var(--red)' : 'var(--green)' }}>
                {rupees(Math.abs(overall - monthTotal))}{monthTotal > overall ? ' over' : ''}</b></div>
              <div><span>Safe daily spend</span><b>{rupees(Math.max(0, Math.round((overall - monthTotal) / Math.max(1, daysIn - dayOfMonth))))}</b></div>
              <div><span>Spent so far</span><b>{Math.round(usedPct)}%</b></div>
            </div>
          </>
        ) : (
          <div className="budget-empty">
            <Target size={22} strokeWidth={1.6} />
            <div>
              <div className="insight-title">No overall budget yet</div>
              <div className="insight-body">Set a monthly cap, or let AI suggest one from your spending history.</div>
            </div>
            <button className="btn primary" style={{ width: 'auto' }} onClick={() => openBudget('')}>Set budget</button>
          </div>
        )}
      </div>

      {/* ── AI suggestions ── */}
      <AnimatePresence>
        {suggestions && (
          <motion.div className="card suggest-card"
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <div className="card-head">
              <h3><Sparkles size={13} style={{ verticalAlign: '-2px' }} /> Suggested budgets</h3>
              <div className="head-actions">
                <button className="btn ghost sm" onClick={suggest} disabled={loadingSuggest}><RefreshCw size={12} /> Redo</button>
                <button className="btn primary sm" style={{ width: 'auto' }} onClick={applyAll}>Apply all</button>
                <button className="icon-btn" onClick={() => setSuggestions(null)} title="Dismiss suggestions"><X size={15} /></button>
              </div>
            </div>
            <p className="suggest-reason">{suggestions.reasoning}</p>

            {suggestions.overall_rupees > 0 && (
              <div className="suggest-row overall">
                <Target size={14} />
                <div className="suggest-row-body">
                  <div className="suggest-row-top">
                    <span className="suggest-row-name">Overall monthly</span>
                    <span className="suggest-row-amt">{rupees(Math.round(suggestions.overall_rupees * 100))}</span>
                  </div>
                </div>
                <button className="btn ghost sm" disabled={applied.includes('')}
                  onClick={() => applyOne('', suggestions.overall_rupees)}>
                  {applied.includes('') ? <><Check size={12} /> Set</> : 'Apply'}
                </button>
              </div>
            )}

            {(suggestions.categories || []).map((c) => (
              <div className="suggest-row" key={c.category}>
                <CategoryIcon category={c.category} size={14} />
                <div className="suggest-row-body">
                  <div className="suggest-row-top">
                    <span className="suggest-row-name">{c.category}</span>
                    <span className="suggest-row-amt">{rupees(Math.round(c.suggested_rupees * 100))}</span>
                  </div>
                  <p className="suggest-row-note">now {rupees(Math.round((c.current_avg_rupees || 0) * 100))} · {c.rationale}</p>
                </div>
                <button className="btn ghost sm" disabled={applied.includes(c.category)}
                  onClick={() => applyOne(c.category, c.suggested_rupees)}>
                  {applied.includes(c.category) ? <><Check size={12} /> Set</> : 'Apply'}
                </button>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── category budgets ── */}
      {catBudgets.length > 0 && (
        <div className="card">
          <h3>Category budgets</h3>
          <div className="budget-rows">
            {catBudgets.map((b, i) => {
              const eff = store.effectiveBudget(b.category, mk);
              const spent = spend[b.category] || 0;
              const pct = eff ? Math.min(100, (spent / eff) * 100) : 0;
              const over = spent > eff;
              return (
                <motion.div className="budget-row" key={b.category} onClick={() => openBudget(b.category)}
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                  <CategoryIcon category={b.category} size={14} />
                  <div className="budget-row-body">
                    <div className="budget-row-top">
                      <span className="budget-row-name">
                        {b.category}
                        {b.carry_forward ? <span className="tx-tag">Carries</span> : null}
                      </span>
                      <span className="budget-row-nums">{rupees(spent)} <em>/ {rupees(eff)}</em></span>
                    </div>
                    <div className="budget-track">
                      <motion.div className={`budget-fill ${over ? 'over' : ''}`}
                        initial={{ width: 0 }} animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.6, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }} />
                      {!over && <span className="pace-marker" style={{ left: `${Math.min(100, expectedPct)}%` }} title="Expected pace" />}
                    </div>
                  </div>
                  <span className={`budget-row-left ${over ? 'over' : ''}`}>
                    {over ? `+${rupees(spent - eff)}` : rupees(eff - spent)}
                  </span>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── quick add for uncovered categories ── */}
      {uncovered.length > 0 && (
        <div className="card">
          <div className="card-head">
            <h3>Not budgeted yet</h3>
            <span className="muted small">{uncovered.length} {uncovered.length === 1 ? 'category' : 'categories'}</span>
          </div>
          <div className="budget-rows">
            {uncovered.map(([c, v], i) => (
              <motion.div className="budget-row unbudgeted" key={c} onClick={() => openBudget(c)}
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                <CategoryIcon category={c} size={14} />
                <div className="budget-row-body">
                  <span className="budget-row-name">{c}</span>
                  <span className="unbudgeted-spent">{rupees(v)} spent this month</span>
                </div>
                <span className="add-budget-cta"><Plus size={13} strokeWidth={2.2} /> Set budget</span>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

// Gemini's output is free-form text coerced to JSON — guard against invented
// category names, non-numeric or duplicate entries before it ever reaches render.
function sanitizeSuggestions(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const seen = new Set();
  const categories = (Array.isArray(raw.categories) ? raw.categories : [])
    .filter((c) => c && typeof c.category === 'string' && CATEGORIES[c.category] && !seen.has(c.category))
    .map((c) => {
      seen.add(c.category);
      return {
        category: c.category,
        suggested_rupees: Number(c.suggested_rupees),
        current_avg_rupees: Number.isFinite(Number(c.current_avg_rupees)) ? Number(c.current_avg_rupees) : 0,
        rationale: typeof c.rationale === 'string' ? c.rationale.slice(0, 120) : '',
      };
    })
    .filter((c) => Number.isFinite(c.suggested_rupees) && c.suggested_rupees > 0)
    .slice(0, 8);

  const overall = Number(raw.overall_rupees);
  const overall_rupees = Number.isFinite(overall) && overall > 0 ? overall : 0;
  if (!overall_rupees && !categories.length) return null;

  return {
    overall_rupees,
    reasoning: typeof raw.reasoning === 'string' ? raw.reasoning.slice(0, 200) : '',
    categories,
  };
}

function BudgetRing({ used, expected, over }) {
  const r = 42, circ = 2 * Math.PI * r;
  const color = over ? 'var(--red)' : used > expected ? '#d97706' : 'var(--accent)';
  return (
    <div className="budget-ring">
      <svg viewBox="0 0 100 100" width="104" height="104">
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="9" />
        <motion.circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round"
          transform="rotate(-90 50 50)"
          initial={{ strokeDasharray: `0 ${circ}` }}
          animate={{ strokeDasharray: `${(used / 100) * circ} ${circ}` }}
          transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }} />
        {/* expected-pace tick */}
        <line x1="50" y1="4" x2="50" y2="13" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round"
          transform={`rotate(${(expected / 100) * 360} 50 50)`} opacity=".8" />
      </svg>
      <span className="budget-ring-pct" style={{ color }}>{Math.round(used)}%</span>
    </div>
  );
}
