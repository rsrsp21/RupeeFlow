'use client';
import { CATEGORIES, rupees } from '@/lib/client/constants';

export default function Donut({ spend }) {
  const entries = Object.entries(spend).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, v]) => s + v, 0);

  if (!total) {
    return (
      <>
        <div className="donut-wrap">
          <svg viewBox="0 0 200 200"><circle cx="100" cy="100" r="70" fill="none" stroke="var(--surface-2)" strokeWidth="18" /></svg>
          <div className="donut-center">No spends<br />this month</div>
        </div>
        <div className="legend" />
      </>
    );
  }

  const top = entries.slice(0, 6);
  const rest = entries.slice(6).reduce((s, [, v]) => s + v, 0);
  if (rest) top.push(['Other', rest]);

  let angle = -90;
  const arcs = top.map(([cat, val]) => {
    const sweep = (val / total) * 360;
    const a1 = (angle * Math.PI) / 180, a2 = ((angle + Math.min(sweep, 359.9)) * Math.PI) / 180;
    const d = `M ${100 + 70 * Math.cos(a1)} ${100 + 70 * Math.sin(a1)} A 70 70 0 ${sweep > 180 ? 1 : 0} 1 ${100 + 70 * Math.cos(a2)} ${100 + 70 * Math.sin(a2)}`;
    angle += sweep;
    return { cat, val, d, color: (CATEGORIES[cat] || CATEGORIES.Other).color };
  });

  return (
    <>
      <div className="donut-wrap">
        <svg viewBox="0 0 200 200">
          {arcs.map((a) => (
            <path key={a.cat} d={a.d} fill="none" stroke={a.color} strokeWidth="18">
              <title>{a.cat}: {rupees(a.val)}</title>
            </path>
          ))}
        </svg>
        <div className="donut-center"><span><b>{rupees(total)}</b>this month</span></div>
      </div>
      <div className="legend">
        {arcs.map((a) => (
          <span key={a.cat}><i style={{ background: a.color }} />{a.cat} · {Math.round((a.val / total) * 100)}%</span>
        ))}
      </div>
    </>
  );
}
