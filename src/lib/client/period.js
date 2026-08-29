// Period math for the ledger/dashboard period switcher.
export const DAY_MS = 86400000;

export const startOfDay = (t = Date.now()) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
export const startOfWeek = (t = Date.now()) => {           // Monday-start weeks
  const d = new Date(startOfDay(t));
  const shift = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - shift);
  return d.getTime();
};
export const startOfMonth = (t = Date.now()) => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); };
export const startOfYear = (t = Date.now()) => { const d = new Date(t); return new Date(d.getFullYear(), 0, 1).getTime(); };

export const PERIODS = ['day', 'week', 'month', 'year'];

export function periodStart(kind, t = Date.now()) {
  if (kind === 'day') return startOfDay(t);
  if (kind === 'week') return startOfWeek(t);
  if (kind === 'month') return startOfMonth(t);
  return startOfYear(t);
}

// exclusive end
export function periodEnd(kind, start) {
  const d = new Date(start);
  if (kind === 'day') return start + DAY_MS;
  if (kind === 'week') return start + 7 * DAY_MS;
  if (kind === 'month') return new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
  return new Date(d.getFullYear() + 1, 0, 1).getTime();
}

export function shiftPeriod(kind, start, dir) {
  const d = new Date(start);
  if (kind === 'day') return start + dir * DAY_MS;
  if (kind === 'week') return start + dir * 7 * DAY_MS;
  if (kind === 'month') return new Date(d.getFullYear(), d.getMonth() + dir, 1).getTime();
  return new Date(d.getFullYear() + dir, 0, 1).getTime();
}

export function periodLabel(kind, start) {
  const d = new Date(start);
  const now = Date.now();
  if (kind === 'day') {
    if (start === startOfDay(now)) return 'Today';
    if (start === startOfDay(now) - DAY_MS) return 'Yesterday';
    return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  }
  if (kind === 'week') {
    if (start === startOfWeek(now)) return 'This week';
    if (start === startOfWeek(now) - 7 * DAY_MS) return 'Last week';
    const end = new Date(start + 6 * DAY_MS);
    const sameMonth = d.getMonth() === end.getMonth();
    return `${d.toLocaleDateString('en-IN', { day: 'numeric', ...(sameMonth ? {} : { month: 'short' }) })} - ${end.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  }
  if (kind === 'month') {
    if (start === startOfMonth(now)) return 'This month';
    return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  }
  if (start === startOfYear(now)) return 'This year';
  return String(d.getFullYear());
}

// Buckets inside a period, for the trend chart on the ledger header.
export function bucketsFor(kind, start) {
  const end = periodEnd(kind, start);
  const out = [];
  if (kind === 'day') {
    for (let h = 0; h < 24; h += 3) {
      const s = start + h * 3600000;
      out.push({ start: s, end: s + 3 * 3600000, label: `${h}` });
    }
  } else if (kind === 'week') {
    for (let i = 0; i < 7; i++) {
      const s = start + i * DAY_MS;
      out.push({ start: s, end: s + DAY_MS, label: new Date(s).toLocaleDateString('en-IN', { weekday: 'narrow' }) });
    }
  } else if (kind === 'month') {
    for (let s = start; s < end; s += DAY_MS) {
      out.push({ start: s, end: s + DAY_MS, label: String(new Date(s).getDate()) });
    }
  } else {
    const y = new Date(start).getFullYear();
    for (let m = 0; m < 12; m++) {
      const s = new Date(y, m, 1).getTime();
      out.push({ start: s, end: new Date(y, m + 1, 1).getTime(), label: 'JFMAMJJASOND'[m] });
    }
  }
  return out;
}

// Today as the USER sees it, not as the server does. The AI prompts anchor
// every relative date ("yesterday", "two days back") to this, and the server
// runs in UTC — so between 00:00 and 05:30 IST its idea of "today" is still
// yesterday, and every relative date the model resolved came out a day early.
export function todayISO(t = Date.now()) {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
