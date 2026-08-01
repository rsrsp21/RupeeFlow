'use client';
// Budgets is its own screen rather than a tab on Money: accounts and savings
// are state you set up once, budgets are something you check through the
// month. Grouping them put the frequent one behind the rare ones.
import { PieChart } from 'lucide-react';
import SyncBadge from '../SyncBadge';
import SettingsLink from '../SettingsLink';
import BudgetsLink from '../BudgetsLink';
import BudgetsPanel from '../BudgetsPanel';

export default function Budgets() {
  return (
    <section className="view">
      <header className="view-head">
        <div>
          <h2><PieChart size={19} strokeWidth={2} /> Budgets</h2>
          <p className="sub">Caps, pace and AI suggestions</p>
        </div>
        <div className="view-head-utils"><SyncBadge /><BudgetsLink /><SettingsLink /></div>
      </header>
      <BudgetsPanel />
    </section>
  );
}
