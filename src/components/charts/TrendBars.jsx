'use client';
// Compact bar/trend chart. Renders responsively without distorting labels:
// bars are positioned in % so we keep preserveAspectRatio intact.
import { motion } from 'framer-motion';
import { rupees } from '@/lib/client/constants';

export default function TrendBars({ buckets, height = 64, showLabels = true }) {
  const max = Math.max(...buckets.map((b) => b.value), 1);
  const n = buckets.length || 1;
  const labelEvery = n <= 8 ? 1 : n <= 14 ? 2 : n <= 24 ? 3 : Math.ceil(n / 8);

  return (
    <div className="trend-wrap" style={{ height: height + (showLabels ? 18 : 0) }}>
      <div className="trend-bars" style={{ height }}>
        {buckets.map((b, i) => {
          const h = b.value > 0 ? Math.max(3, (b.value / max) * 100) : 2;
          return (
            <div className="trend-col" key={b.start ?? i}>
              <motion.span
                className={`trend-bar ${b.value > 0 ? '' : 'zero'}`}
                initial={{ height: 0 }}
                animate={{ height: `${h}%` }}
                transition={{ duration: 0.45, delay: Math.min(i * 0.012, 0.25), ease: [0.22, 1, 0.36, 1] }}
              >
                <span className="trend-tip">{b.label}: {rupees(b.value)}</span>
              </motion.span>
            </div>
          );
        })}
      </div>
      {showLabels && (
        <div className="trend-labels">
          {buckets.map((b, i) => (
            <span key={b.start ?? i}>{i % labelEvery === 0 ? b.label : ''}</span>
          ))}
        </div>
      )}
    </div>
  );
}
