'use client';
import { Target, RefreshCw } from 'lucide-react';
import { useStore } from '@/lib/client/store';
import { rupees, monthKey } from '@/lib/client/constants';
import { useUI } from '../App';
import CategoryIcon from '../CategoryIcon';

export default function Budgets() {
  const store = useStore();
  const { openBudget } = useUI();
  const mk = monthKey();
  const spend = store.catSpend(mk);
  const monthTotal = store.totals(store.live().filter((t) => store.inMonth(t))).exp;
  const monthBudgets = store.budgets.filter((b) => b.month === mk);

  return (
    <section className="view">
      <header className="view-head">
        <div>
          <h2>Budgets</h2>
          <p className="sub">{new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</p>
        </div>
        <button className="btn ghost" onClick={() => openBudget('')}>Set budget</button>
      </header>

      <div className="budget-grid">
        {monthBudgets.length ? monthBudgets.map((b) => {
          const eff = store.effectiveBudget(b.category, mk);
          const spent = b.category ? (spend[b.category] || 0) : monthTotal;
          const pctVal = eff ? Math.min(100, (spent / eff) * 100) : 0;
          const over = spent > eff;
          return (
            <div key={b.category || '_overall'} className="budget-card" onClick={() => openBudget(b.category)}>
              <h4>
                <span>
                  {b.category
                    ? <CategoryIcon category={b.category} size={13} />
                    : <span className="cat-tile" style={{ color: 'var(--accent)', background: 'var(--accent-soft)' }}><Target size={13} strokeWidth={1.9} /></span>}
                  <span>{b.category || 'Overall monthly'}</span>
                </span>
                {b.carry_forward ? <em title="Unused budget carries forward"><RefreshCw size={11} /></em> : null}
              </h4>
              <div className="budget-track">
                <div className={`budget-fill ${over ? 'over' : ''}`} style={{ width: `${pctVal}%` }} />
              </div>
              <div className="budget-nums">
                <span>{rupees(spent)} spent</span>
                <span>{over ? `${rupees(spent - eff)} over` : `${rupees(eff - spent)} left`}</span>
              </div>
            </div>
          );
        }) : <p className="empty">No budgets yet. Set one to track progress here.</p>}
      </div>
    </section>
  );
}
