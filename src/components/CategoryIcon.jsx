'use client';
// Professional line icons (Lucide) per category — replaces emoji tiles.
import {
  Utensils, ShoppingCart, CarTaxiFront, Fuel, ShoppingBag, Zap, Home, HeartPulse,
  GraduationCap, Clapperboard, Plane, Repeat, Scissors, Gift, TrendingUp, Briefcase,
  Building2, Landmark, Shield, Tag, ArrowLeftRight,
} from 'lucide-react';
import { CATEGORIES } from '@/lib/client/constants';

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
  const Icon = transfer ? ArrowLeftRight : (ICONS[category] || Tag);
  const color = transfer ? 'var(--muted)' : (CATEGORIES[category] || CATEGORIES.Other).color;
  return (
    <span className="cat-tile" style={{ color, background: `color-mix(in srgb, ${color} 12%, transparent)` }}>
      <Icon size={size} strokeWidth={1.9} />
    </span>
  );
}
