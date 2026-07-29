'use client';
// Professional line icons (Lucide) per built-in category — replaces emoji
// tiles. A user-created custom category instead renders its AI-generated
// SVG (see store.addCustomCategory / /api/ai/category-icon), re-sanitized
// here client-side as defense in depth before it's ever set as innerHTML.
import {
  Utensils, ShoppingCart, CarTaxiFront, Fuel, ShoppingBag, Zap, Home, HeartPulse,
  GraduationCap, Clapperboard, Plane, Repeat, Scissors, Gift, TrendingUp, Briefcase,
  Building2, Landmark, Shield, Tag, ArrowLeftRight,
} from 'lucide-react';
import { CATEGORIES } from '@/lib/client/constants';
import { useStore } from '@/lib/client/store';
import { sanitizeSvg } from '@/lib/svgSanitize';

const ICONS = {
  'Food & Dining': Utensils,
  'Groceries': ShoppingCart,
  'Transport': CarTaxiFront,
  'Fuel': Fuel,
  'Shopping': ShoppingBag,
  'Bills & Utilities': Zap,
  'Rent': Home,
  'Health': HeartPulse,
  'Education': GraduationCap,
  'Entertainment': Clapperboard,
  'Travel': Plane,
  'Subscriptions': Repeat,
  'Personal Care': Scissors,
  'Gifts & Donations': Gift,
  'Investments': TrendingUp,
  'Salary': Briefcase,
  'Business': Building2,
  'EMI & Loans': Landmark,
  'Insurance': Shield,
  'Other': Tag,
};

export default function CategoryIcon({ category, transfer = false, size = 15 }) {
  const { customCategories } = useStore();
  const custom = !transfer && customCategories.find((c) => c.name === category);
  const safeSvg = custom?.icon_svg ? sanitizeSvg(custom.icon_svg) : null;

  if (safeSvg) {
    return (
      <span className="cat-tile" style={{ color: custom.color, background: `color-mix(in srgb, ${custom.color} 12%, transparent)` }}>
        <span style={{ width: size, height: size, display: 'inline-block' }} dangerouslySetInnerHTML={{ __html: safeSvg }} />
      </span>
    );
  }

  const Icon = transfer ? ArrowLeftRight : (ICONS[category] || Tag);
  const color = transfer ? 'var(--muted)' : custom?.color || (CATEGORIES[category] || CATEGORIES.Other).color;
  return (
    <span className="cat-tile" style={{ color, background: `color-mix(in srgb, ${color} 12%, transparent)` }}>
      <Icon size={size} strokeWidth={1.9} />
    </span>
  );
}
