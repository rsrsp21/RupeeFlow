'use client';
// Money — where your money sits (accounts) and where it's parked (savings &
// investments). Those two are state you set up once and rarely touch, and net
// worth is literally their sum, so they belong together. Budgets went back to
// their own screen: you check those through the month, and burying a frequent
// screen behind two rare ones cost more clicks than the grouping saved.
// Categories stay in Settings — a labelling preference, not a place money lives.
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Wallet, PiggyBank } from 'lucide-react';
import { useStore } from '@/lib/client/store';
import { rupees } from '@/lib/client/constants';
import SyncBadge from '../SyncBadge';
import SettingsLink from '../SettingsLink';
import InsightsLink from '../InsightsLink';
import AccountsPanel from '../money/AccountsPanel';
import SavingsPanel from '../money/SavingsPanel';

const TABS = [
  ['accounts', 'Accounts', Wallet],
  ['savings', 'Savings', PiggyBank],
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
          <p className="sub">Accounts, savings and investments</p>
        </div>
        <div className="view-head-utils"><SyncBadge /><InsightsLink /><SettingsLink /></div>
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
      </motion.div>
    </section>
  );
}
