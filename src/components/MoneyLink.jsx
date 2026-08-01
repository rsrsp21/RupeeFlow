'use client';
// Mobile-only shortcut to Money. It's the screen you configure — accounts,
// savings, holdings — rather than one you check, so of the five it has the
// weakest claim on a bottom-nav slot. Net worth, the one thing you'd open it
// daily for, is shown on the dashboard hero instead.
import { Wallet } from 'lucide-react';
import { useUI } from './App';

export default function MoneyLink() {
  const { view, setView } = useUI();
  if (view === 'money') return null;
  return (
    <button className="icon-btn settings-link" onClick={() => setView('money')} title="Money" aria-label="Money">
      <Wallet size={19} strokeWidth={1.9} />
    </button>
  );
}
