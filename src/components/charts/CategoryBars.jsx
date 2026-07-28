'use client';
// Ranked horizontal category breakdown — reads faster than a donut for "where did it go".
import { motion } from 'framer-motion';
import { CATEGORIES, rupees } from '@/lib/client/constants';
import CategoryIcon from '../CategoryIcon';

export default function CategoryBars({ spend, limit = 6, onPick }) {
  const entries = Object.entries(spend).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  if (!total) return <p className="empty">No spending in this period.</p>;
  const top = entries.slice(0, limit);

  return (
    <div className="cat-bars">
      {top.map(([cat, val], i) => {
        const pct = (val / total) * 100;
        const color = (CATEGORIES[cat] || CATEGORIES.Other).color;
        return (
          <div className="cat-bar" key={cat} onClick={() => onPick?.(cat)} role={onPick ? 'button' : undefined}>
            <CategoryIcon category={cat} size={13} />
            <div className="cat-bar-body">
              <div className="cat-bar-top">
                <span className="cat-bar-name">{cat}</span>
                <span className="cat-bar-val">{rupees(val)}</span>
              </div>
              <div className="cat-bar-track">
                <motion.div className="cat-bar-fill"
                  initial={{ width: 0 }} animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.55, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }}
                  style={{ background: color }} />
              </div>
            </div>
            <span className="cat-bar-pct">{Math.round(pct)}%</span>
          </div>
        );
      })}
    </div>
  );
}
