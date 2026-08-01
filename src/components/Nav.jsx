'use client';
import { LayoutGrid, List, PieChart, Sparkles, PiggyBank, Settings, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useStore } from '@/lib/client/store';

// Split around a middle slot so the FAB has a gap to sit in on the mobile tab
// bar (see .nav-fab-slot / .fab-cluster in globals.css) — desktop just renders
// straight through, the slot collapses to nothing there.
const LEFT_ITEMS = [
  ['dashboard', 'Home', LayoutGrid],
  ['transactions', 'Ledger', List],
];
// Insights and Settings are desktop-sidebar only. The mobile bar has room for
// four tabs around the centred FAB before labels start colliding with it, so
// both are reached from the header instead (InsightsLink / SettingsLink).
const RIGHT_ITEMS = [
  ['savings', 'Savings', PiggyBank],
  ['budgets', 'Budgets', PieChart],
];

export function Nav({ view, setView, collapsed, setCollapsed }) {
  const { syncState } = useStore();
  const syncText = syncState === 'online' ? 'Synced' : syncState === 'pending' ? 'Syncing' : 'Offline';

  const item = ([id, label, Icon]) => (
    <button key={id} className={`nav-item ${view === id ? 'active' : ''}`}
      onClick={() => setView(id)} title={label} aria-label={label}>
      <Icon size={17} strokeWidth={1.9} />
      <span className="nav-text">{label}</span>
    </button>
  );

  return (
    <aside className={`nav ${collapsed ? 'collapsed' : ''}`}>
      <div className="nav-top">
        <button className="nav-brand" title="Go to dashboard" onClick={() => setView('dashboard')}>
          <svg viewBox="0 0 48 48" width="24" height="24"><use href="/icon.svg#mark" /></svg>
          <span className="nav-text">RupeeFlow</span>
        </button>
        <button className="icon-btn nav-collapse" onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>

      {LEFT_ITEMS.map(item)}
      {/* mobile-only gap the FAB floats over; collapses on desktop */}
      <div className="nav-fab-slot" aria-hidden="true" />
      {RIGHT_ITEMS.map(item)}

      <button key="insights" className={`nav-item insights-item ${view === 'insights' ? 'active' : ''}`}
        onClick={() => setView('insights')} title="Insights" aria-label="Insights">
        <Sparkles size={17} strokeWidth={1.9} />
        <span className="nav-text">Insights</span>
      </button>

      {/* Desktop-only: on mobile Settings isn't a tab at all — it's reached via
          SettingsLink beside each screen's heading instead (see globals.css). */}
      <button key="settings" className={`nav-item settings-item ${view === 'settings' ? 'active' : ''}`}
        onClick={() => setView('settings')} title="Settings" aria-label="Settings">
        <Settings size={17} strokeWidth={1.9} />
        <span className="nav-text">Settings</span>
      </button>

      <div className="nav-spacer" />
      <div className={`sync-dot ${syncState === 'online' ? 'online' : syncState === 'pending' ? 'pending' : ''}`}
        title={`Sync: ${syncText}`}>
        <span /><em className="nav-text">{syncText}</em>
      </div>
    </aside>
  );
}
