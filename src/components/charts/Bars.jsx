'use client';
import { rupees } from '@/lib/client/constants';

export default function Bars({ transactions }) {
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
    days.push({ start: d.getTime(), end: d.getTime() + 86400000, label: d.getDate(), v: 0 });
  }
  for (const t of transactions) {
    if (t.type !== 'expense') continue;
    for (const day of days) if (t.occurred_at >= day.start && t.occurred_at < day.end) day.v += Number(t.amount);
  }
  const max = Math.max(...days.map((d) => d.v), 1);
  const bw = 320 / 14;

  return (
    <svg viewBox="0 0 320 150" preserveAspectRatio="none" style={{ width: '100%', height: 150 }}>
      {days.map((d, i) => {
        const h = Math.max(2, (d.v / max) * 118);
        return (
          <g key={d.start}>
            <rect x={i * bw + 4} y={132 - h} width={bw - 8} height={h} rx="4"
              fill={d.v ? 'var(--accent)' : 'var(--surface-2)'}>
              <title>{rupees(d.v)}</title>
            </rect>
            <text x={i * bw + bw / 2} y="146" fontSize="8" fill="var(--muted)" textAnchor="middle">{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}
