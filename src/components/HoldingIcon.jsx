'use client';
// Icon + color per holding KIND, mirroring AccountIcon's treatment. Custom
// kinds the user invents fall through to the generic piggy bank.
import { TrendingUp, CandlestickChart, Landmark, Home, PiggyBank } from 'lucide-react';

const KIND_ICONS = {
  'Mutual Funds': { icon: TrendingUp, color: '#34d399' },
  'Stocks': { icon: CandlestickChart, color: '#60a5fa' },
  'FD': { icon: Landmark, color: '#a78bfa' },
  'Home': { icon: Home, color: '#fbbf24' },
};
const FALLBACK = { icon: PiggyBank, color: '#14b8a6' };

export default function HoldingIcon({ kind, size = 15, tile = false }) {
  const { icon: Icon, color } = KIND_ICONS[kind] || FALLBACK;
  if (!tile) return <Icon size={size} strokeWidth={2} style={{ color, flexShrink: 0 }} />;
  return (
    <span className="cat-tile" style={{ color, background: `color-mix(in srgb, ${color} 12%, transparent)` }}>
      <Icon size={size} strokeWidth={1.9} />
    </span>
  );
}
