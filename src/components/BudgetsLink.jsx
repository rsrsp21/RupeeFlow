'use client';
// Mobile-only shortcut to Budgets, beside SettingsLink in each header. The
// bottom bar fits four tabs; Insights took the slot because Budgets is
// already one tap from the dashboard's pace bar and budget card, while
// Insights had no equivalent shortcut.
import { PieChart } from 'lucide-react';
import { useUI } from './App';

export default function BudgetsLink() {
  const { view, setView } = useUI();
  if (view === 'budgets') return null;
  return (
    <button className="icon-btn settings-link" onClick={() => setView('budgets')} title="Budgets" aria-label="Budgets">
      <PieChart size={19} strokeWidth={1.9} />
    </button>
  );
}
