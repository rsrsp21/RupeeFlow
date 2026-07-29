// Export engine — CSV / PDF / JSON with configurable scope, grouping and columns.
import { DAY_MS, startOfDay, startOfWeek, startOfMonth, startOfYear } from './period';

export const COLUMNS = {
  date: { label: 'Date', get: (t) => new Date(Number(t.occurred_at)).toLocaleDateString('en-IN') },
  type: { label: 'Type', get: (t) => t.type },
  category: { label: 'Category', get: (t) => t.category },
  note: { label: 'Note', get: (t) => t.note },
  account: { label: 'Account', get: (t) => t.account },
  to_account: { label: 'To account', get: (t) => t.to_account },
  source: { label: 'Added via', get: (t) => t.source },
  // declared last so it sorts last by default — see orderForOutput()
  amount: { label: 'Amount (INR)', get: (t) => (t.amount / 100).toFixed(2) },
};

// Amount reads best as the right-hand column regardless of how columns were
// toggled on/off, so force it last at output time rather than relying on
// insertion order.
const orderForOutput = (cols) => [...cols.filter((c) => c !== 'amount'), ...cols.filter((c) => c === 'amount')];

export const RANGES = {
  month: { label: 'This month', from: () => startOfMonth() },
  lastMonth: {
    label: 'Last month',
    from: () => { const d = new Date(startOfMonth()); return new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime(); },
    to: () => startOfMonth(),
  },
  week: { label: 'This week', from: () => startOfWeek() },
  last30: { label: 'Last 30 days', from: () => startOfDay() - 29 * DAY_MS },
  last90: { label: 'Last 90 days', from: () => startOfDay() - 89 * DAY_MS },
  year: { label: 'This year', from: () => startOfYear() },
  all: { label: 'All time', from: () => 0 },
};

// Resolved absolute [from, to) instants for whatever range/custom dates were
// picked — the single source of truth for filtering, labels and filenames.
export function resolveRange(opts) {
  const r = RANGES[opts.range] || RANGES.all;
  const from = opts.customFrom ?? r.from();
  const to = opts.customTo ?? (r.to ? r.to() : Date.now() + DAY_MS);
  return { from, to };
}

const fmtDate = (ts) => new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

// A relative label like "This month" means nothing once a document has been
// downloaded and opened later, so exports always spell out the actual dates.
export function formatRangeLabel(opts) {
  if (opts.range === 'all' && opts.customFrom == null && opts.customTo == null) return 'All time';
  const { from, to } = resolveRange(opts);
  const endInclusive = to - DAY_MS;
  return fmtDate(from) === fmtDate(endInclusive) ? fmtDate(from) : `${fmtDate(from)} – ${fmtDate(endInclusive)}`;
}

// Compact, sortable date tag for filenames — no ambiguous words like "month".
export function rangeFileTag(opts) {
  if (opts.range === 'all' && opts.customFrom == null && opts.customTo == null) return 'all-time';
  const { from, to } = resolveRange(opts);
  const iso = (ts) => new Date(ts).toISOString().slice(0, 10);
  const endIso = iso(to - DAY_MS);
  return iso(from) === endIso ? iso(from) : `${iso(from)}_to_${endIso}`;
}

export function selectRows(all, opts) {
  const { from, to } = resolveRange(opts);
  let rows = all.filter((t) => t.occurred_at >= from && t.occurred_at < to);
  if (opts.type) rows = rows.filter((t) => t.type === opts.type);
  if (opts.category) rows = rows.filter((t) => t.category === opts.category);
  return rows.sort((a, b) => a.occurred_at - b.occurred_at);
}

const esc = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCSV(rows, cols) {
  const ordered = orderForOutput(cols);
  const head = ordered.map((c) => COLUMNS[c].label).join(',');
  const body = rows.map((t) => ordered.map((c) => esc(COLUMNS[c].get(t))).join(','));
  return [head, ...body].join('\n');
}

// Summary tables used by both PDF and the "summary only" CSV mode
export function summarize(rows, groupBy) {
  const map = new Map();
  const keyOf = (t) => {
    if (groupBy === 'category') return t.category;
    if (groupBy === 'account') return t.account;
    if (groupBy === 'month') return new Date(Number(t.occurred_at)).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
    if (groupBy === 'day') return new Date(Number(t.occurred_at)).toLocaleDateString('en-IN');
    return 'All';
  };
  for (const t of rows) {
    const k = keyOf(t);
    if (!map.has(k)) map.set(k, { key: k, expense: 0, income: 0, count: 0 });
    const g = map.get(k);
    if (t.type === 'expense') g.expense += t.amount;
    else if (t.type === 'income') g.income += t.amount;
    g.count++;
  }
  return [...map.values()].sort((a, b) => b.expense - a.expense);
}

export function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

const loadScript = (src) => new Promise((res, rej) => {
  const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej;
  document.head.appendChild(s);
});

export async function ensureJsPDF() {
  if (!window.jspdf) {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js');
  }
  return window.jspdf.jsPDF;
}

export async function toPDF(rows, opts, meta) {
  const JsPDF = await ensureJsPDF();
  const doc = new JsPDF({ orientation: opts.orientation || 'portrait' });
  const rangeLabel = formatRangeLabel(opts);

  const inc = rows.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const exp = rows.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

  doc.setFontSize(18); doc.text('RupeeFlow', 14, 18);
  doc.setFontSize(10); doc.setTextColor(120);
  const headLine = [rangeLabel, meta.name || '', `generated ${new Date().toLocaleDateString('en-IN')}`]
    .filter(Boolean).join('  ·  ');
  doc.text(headLine, 14, 25);

  // fixed 2 decimals throughout so a column of amounts lines up digit-under-
  // digit once right-aligned in a monospace font (e.g. 120.00 under 50.08)
  const inr = (paise) => (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  doc.setTextColor(20); doc.setFontSize(11);
  doc.text(`Income  Rs ${inr(inc)}`, 14, 36);
  doc.text(`Expenses  Rs ${inr(exp)}`, 74, 36);
  doc.text(`Net  Rs ${inr(inc - exp)}`, 144, 36);

  let y = 44;
  if (opts.includeSummary) {
    const groups = summarize(rows, opts.groupBy || 'category');
    doc.autoTable({
      startY: y,
      head: [[opts.groupBy === 'month' ? 'Month' : opts.groupBy === 'day' ? 'Day'
        : opts.groupBy === 'account' ? 'Account' : 'Category',
        'Entries', 'Spent (Rs)', 'Received (Rs)']],
      body: groups.map((g) => [g.key, g.count, inr(g.expense), inr(g.income)]),
      theme: 'striped',
      headStyles: { fillColor: [23, 23, 26], fontSize: 9 },
      styles: { fontSize: 9, cellPadding: 3 },
      columnStyles: { 2: { halign: 'right', font: 'courier' }, 3: { halign: 'right', font: 'courier' } },
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  if (opts.includeTransactions) {
    const cols = orderForOutput(opts.columns.filter((c) => c !== 'to_account' || rows.some((t) => t.to_account)));
    const amtIdx = cols.indexOf('amount');
    doc.autoTable({
      startY: y,
      head: [cols.map((c) => COLUMNS[c].label)],
      body: rows.map((t) => cols.map((c) => COLUMNS[c].get(t))),
      theme: 'grid',
      headStyles: { fillColor: [23, 23, 26], fontSize: 8 },
      styles: { fontSize: 7.5, cellPadding: 2 },
      columnStyles: amtIdx >= 0 ? { [amtIdx]: { halign: 'right', font: 'courier' } } : {},
    });
  }

  if (opts.aiSummary) {
    doc.addPage();
    doc.setFontSize(13); doc.setTextColor(20);
    doc.text('AI summary', 14, 20);
    doc.setFontSize(10); doc.setTextColor(60);
    doc.text(doc.splitTextToSize(opts.aiSummary, 180), 14, 30);
  }

  doc.save(`rupeeflow-${rangeFileTag(opts)}.pdf`);
}
