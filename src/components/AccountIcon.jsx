'use client';
// Icon + color per account TYPE (Cash/Bank/UPI/Credit Card/Savings/Other),
// same visual treatment as CategoryIcon. Keyed by type rather than the
// account's display name so a custom name ("HDFC") still gets the right
// icon — callers resolve name -> type via store.accountType() first.
import { Banknote, Landmark, Smartphone, CreditCard, PiggyBank, Wallet } from 'lucide-react';

const TYPE_ICONS = {
  'Cash': { icon: Banknote, color: '#22c55e' },
  'Bank': { icon: Landmark, color: '#3b82f6' },
  'UPI': { icon: Smartphone, color: '#8b5cf6' },
  'Credit Card': { icon: CreditCard, color: '#f59e0b' },
  'Savings': { icon: PiggyBank, color: '#14b8a6' },
};
const FALLBACK = { icon: Wallet, color: '#9ca3af' };

// tile=false (default) renders a plain colored glyph for compact inline use
// (e.g. a transaction's meta line); tile=true wraps it in the same rounded
// swatch CategoryIcon uses, for standalone list rows like Settings' account list.
export default function AccountIcon({ type, size = 15, tile = false }) {
  const { icon: Icon, color } = TYPE_ICONS[type] || FALLBACK;
  if (!tile) return <Icon size={size} strokeWidth={2} style={{ color, flexShrink: 0 }} />;
  return (
    <span className="cat-tile" style={{ color, background: `color-mix(in srgb, ${color} 12%, transparent)` }}>
      <Icon size={size} strokeWidth={1.9} />
    </span>
  );
}
