'use client';
// Money — one screen for everything you set up rather than record: where money
// sits (accounts), where it's parked (savings & investments), what you've
// capped (budgets), and how you label it (categories). These were scattered
// across Settings and two separate tabs before, which meant four places to go
// for four halves of the same question.
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Wallet, PiggyBank, PieChart, Tags } from 'lucide-react';
import { useStore } from '@/lib/client/store';
import { rupees } from '@/lib/client/constants';
import SyncBadge from '../SyncBadge';
import SettingsLink from '../SettingsLink';
import AccountsPanel from '../money/AccountsPanel';
import SavingsPanel from '../money/SavingsPanel';
import BudgetsPanel from '../money/BudgetsPanel';
import CategoriesPanel from '../money/CategoriesPanel';

const TABS = [
  ['accounts', 'Accounts', Wallet],
  ['savings', 'Savings', PiggyBank],
  ['budgets', 'Budgets', PieChart],
  ['categories', 'Categories', Tags],
];

const TAB_KEY = 'rf_money_tab';

export default function Money() {
  const store = useStore();
  const [tab, setTab] = useState('accounts');

  // Remembered, so returning to this screen lands where you left it rather
  // than resetting to Accounts every time.
  useEffect(() => {
    const saved = localStorage.getItem(TAB_KEY);
    if (saved && TABS.some(([id]) => id === saved)) setTab(saved);
  }, []);
  function pick(id) {
    setTab(id);
    localStorage.setItem(TAB_KEY, id);
  }

  const worth = store.netWorth();

  return (
    <section className="view">
      <header className="view-head">
        <div>
          <h2><Wallet size={19} strokeWidth={2} /> Money</h2>
          <p className="sub">Accounts, savings, budgets and categories</p>
        </div>
        <div className="view-head-utils"><SyncBadge /><SettingsLink /></div>
      </header>

      {/* Net worth stays pinned above the tabs — it's the one number every
          tab below contributes to, so it shouldn't hide inside one of them. */}
      <div className="hero-card money-hero">
        <p className="hero-label">Net worth</p>
        <h1 className="hero-amount">{rupees(worth.total)}</h1>
        <div className="kpi-strip">
          <div className="kpi">
            <span className="kpi-label"><Wallet size={14} /> Spendable</span>
            <b className="kpi-value">{rupees(worth.spendable)}</b>
          </div>
          <div className="kpi">
            <span className="kpi-label"><PiggyBank size={14} /> Saved &amp; invested</span>
            <b className="kpi-value">{rupees(worth.invested)}</b>
          </div>
          {worth.dues > 0 && (
            <div className="kpi">
              <span className="kpi-label">Card dues</span>
              <b className="kpi-value" style={{ color: 'var(--red)' }}>−{rupees(worth.dues)}</b>
            </div>
          )}
        </div>
      </div>

      <div className="money-tabs" role="tablist">
        {TABS.map(([id, label, Icon]) => (
          <button key={id} role="tab" aria-selected={tab === id}
            className={`money-tab ${tab === id ? 'on' : ''}`} onClick={() => pick(id)}>
            <Icon size={15} strokeWidth={1.9} />
            <span>{label}</span>
            {tab === id && <motion.span className="money-tab-underline" layoutId="money-tab-underline" />}
          </button>
        ))}
      </div>

      {/* Opacity-only and no AnimatePresence: an exit-then-enter wait can get
          stuck when a burst of store updates lands mid-transition (same
          reason App.jsx swaps views this way). */}
      <motion.div key={tab} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        transition={{ duration: 0.16, ease: 'easeOut' }}>
        {tab === 'accounts' && <AccountsPanel />}
        {tab === 'savings' && <SavingsPanel />}
        {tab === 'budgets' && <BudgetsPanel />}
        {tab === 'categories' && <CategoriesPanel />}
      </motion.div>
    </section>
  );
}
