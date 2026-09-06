'use client';
// Compact bar/trend chart. Renders responsively without distorting labels:
// bars are positioned in % so we keep preserveAspectRatio intact.
// Hover tooltips don't exist on touch, so for short ranges (showValues) the
// amount is printed above each bar instead of hidden behind a hover state.
import { motion } from 'framer-motion';
import { rupees, rupeesShort } from '@/lib/client/constants';

export default function TrendBars({ buckets, height = 64, showLabels = true, showValues = false }) {
  const max = Math.max(...buckets.map((b) => b.value), 1);
  const n = buckets.length || 1;
  const labelEvery = n <= 8 ? 1 : n <= 14 ? 2 : n <= 24 ? 3 : Math.ceil(n / 8);
  // fewer bars get more breathing room; many-bucket views (month/year) stay tight
  const gap = n <= 8 ? 7 : n <= 16 ? 4 : 2;
  // leave headroom above the tallest bar so its value label never pokes out the top
  const labelReservePx = showValues ? 18 : 0;
  const maxBarPct = showValues ? Math.max(50, 100 - (labelReservePx / height) * 100) : 100;

  return (
    <div className="trend-wrap" style={{ height: height + (showLabels ? 18 : 0) }}>
      <div className="trend-bars" style={{ height, gap }}>
        {buckets.map((b, i) => {
          const h = b.value > 0 ? Math.max(3, (b.value / max) * maxBarPct) : 2;
          return (
            <div className={`trend-col ${showValues ? 'has-value' : ''}`} key={b.start ?? i}>
              {showValues && b.value > 0 && <span className="trend-val">{rupeesShort(b.value)}</span>}
              <motion.span
                className={`trend-bar ${b.value > 0 ? '' : 'zero'} ${b.active ? 'active' : ''}`}
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
        <div className="trend-labels" style={{ gap }}>
          {buckets.map((b, i) => (
            <span key={b.start ?? i} className={b.active ? 'on' : undefined}>{i % labelEvery === 0 ? b.label : ''}</span>
          ))}
        </div>
      )}
    </div>
  );
}
