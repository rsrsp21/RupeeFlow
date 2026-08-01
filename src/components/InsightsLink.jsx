'use client';
// Mobile-only shortcut to Insights, sitting beside SettingsLink in each
// screen's header. The bottom bar only fits four tabs around the centred FAB
// before labels run under it, so Insights lives up here on small screens and
// stays a normal sidebar item on desktop.
import { Sparkles } from 'lucide-react';
import { useUI } from './App';

export default function InsightsLink() {
  const { view, setView } = useUI();
  if (view === 'insights') return null;
  return (
    <button className="icon-btn settings-link" onClick={() => setView('insights')} title="Insights" aria-label="Insights">
      <Sparkles size={20} strokeWidth={1.9} />
    </button>
  );
}
