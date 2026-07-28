'use client';
import { LayoutGrid, List, PieChart, Sparkles, Settings, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useStore } from '@/lib/client/store';

const ITEMS = [
  ['dashboard', 'Home', LayoutGrid],
  ['transactions', 'Ledger', List],
  ['budgets', 'Budgets', PieChart],
  ['insights', 'Insights', Sparkles],
  ['settings', 'Settings', Settings],
];

export function Nav({ view, setView, collapsed, setCollapsed }) {
  const { syncState } = useStore();
  const syncText = syncState === 'online' ? 'Synced' : syncState === 'pending' ? 'Syncing' : 'Offline';

  return (
    <aside className={`nav ${collapsed ? 'collapsed' : ''}`}>
      <div className="nav-top">
        <div className="nav-brand" title="RupeeFlow">
          <svg viewBox="0 0 48 48" width="24" height="24"><use href="/icon.svg#mark" /></svg>
          <span className="nav-text">RupeeFlow</span>
        </div>
        <button className="icon-btn nav-collapse" onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>

      {ITEMS.map(([id, label, Icon]) => (
        <button key={id} className={`nav-item ${view === id ? 'active' : ''}`}
          onClick={() => setView(id)} title={label} aria-label={label}>
          <Icon size={17} strokeWidth={1.9} />
          <span className="nav-text">{label}</span>
        </button>
      ))}

      <div className="nav-spacer" />
      <div className={`sync-dot ${syncState === 'online' ? 'online' : syncState === 'pending' ? 'pending' : ''}`}
        title={`Sync: ${syncText}`}>
        <span /><em className="nav-text">{syncText}</em>
      </div>
    </aside>
  );
}
