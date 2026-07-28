'use client';
import { LayoutGrid, List, PieChart, Sparkles, Settings } from 'lucide-react';
import { useStore } from '@/lib/client/store';

const ITEMS = [
  ['dashboard', 'Home', LayoutGrid],
  ['transactions', 'Ledger', List],
  ['budgets', 'Budgets', PieChart],
  ['insights', 'Insights', Sparkles],
  ['settings', 'Settings', Settings],
];

export function Nav({ view, setView }) {
  const { syncState } = useStore();
  return (
    <aside className="nav">
      <div className="nav-brand">
        <svg viewBox="0 0 48 48" width="26" height="26"><use href="/icon.svg#mark" /></svg>
        <span>RupeeFlow</span>
      </div>
      {ITEMS.map(([id, label, Icon]) => (
        <button key={id} className={`nav-item ${view === id ? 'active' : ''}`} onClick={() => setView(id)} title={label}>
          <Icon size={17} strokeWidth={1.9} /><span>{label}</span>
        </button>
      ))}
      <div className="nav-spacer" />
      <div className={`sync-dot ${syncState === 'online' ? 'online' : syncState === 'pending' ? 'pending' : ''}`} title="Sync status">
        <span /><em>{syncState === 'online' ? 'Synced' : syncState === 'pending' ? 'Syncing' : 'Offline'}</em>
      </div>
    </aside>
  );
}
