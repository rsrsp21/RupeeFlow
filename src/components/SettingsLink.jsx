'use client';
// Mobile-only shortcut to Settings, pinned beside each screen's heading (see
// .view-head-utils in globals.css) now that Settings itself isn't a tab in
// the mobile bottom bar. Hidden while already on Settings — no point linking
// to the screen you're standing on.
import { Settings } from 'lucide-react';
import { useUI } from './App';

export default function SettingsLink() {
  const { view, setView } = useUI();
  if (view === 'settings') return null;
  return (
    <button className="icon-btn settings-link" onClick={() => setView('settings')} title="Settings" aria-label="Settings">
      <Settings size={16} strokeWidth={1.9} />
    </button>
  );
}
